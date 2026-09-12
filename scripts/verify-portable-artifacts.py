"""Read-only audit of real Portable release assets (never executes the product).

Optionally use the verifier compiled with the same public key as the fixtures.
No signing credentials or developer profile directories are read.
"""
import argparse
import hashlib
import json
import os
import struct
import subprocess
import zipfile
from pathlib import Path


def sha(stream):
    return hashlib.file_digest(stream, 'sha256').hexdigest()


def verify_production_payload(package, expected_gateway, public_key):
    assert expected_gateway.rstrip('/') == 'https://wangai-ai.onrender.com', 'Expected live WANGAI gateway'
    assert public_key.strip(), 'Expected production updater public key'
    core = package.read('gamelingo.exe')
    assert expected_gateway.rstrip('/').encode() in core, 'Live gateway is not embedded in core'
    assert b'https://127.0.0.1:19439' not in core, 'Test gateway in production preview'
    assert b'dev.gamelingo.overlay.release-test' not in core, 'Test identity in production preview'
    for entrypoint in ('gamelingo.exe', 'WANGAI.exe'):
        assert public_key.strip().encode() in package.read(entrypoint), 'Production public key mismatch'


def audit(folder, verifier=None, production=False):
    manifest = json.loads((folder / 'package-manifest.json').read_text(encoding='utf8'))
    version = manifest['version']
    archive = folder / f'WANGAI_{version}_x64-update.zip'
    executable = folder / f'WANGAI_{version}_x64-portable.exe'
    assert manifest['format'] == 1 and manifest['architecture'] == 'x86_64'
    checksums = (folder / 'SHA256SUMS.txt').read_text().splitlines()
    for line in checksums:
        expected, name = line.split('  ', 1)
        assert Path(name).name == name
        with (folder / name).open('rb') as stream:
            assert sha(stream) == expected, f'Asset checksum mismatch: {name}'
    expanded = 0
    with zipfile.ZipFile(archive) as package:
        names = package.namelist()
        assert len(names) == len(set(name.casefold() for name in names))
        assert set(names) == set(manifest['files']) | {'package-manifest.json', 'package-manifest.json.sig'}
        assert package.read('package-manifest.json') == (folder / 'package-manifest.json').read_bytes()
        for name, item in manifest['files'].items():
            parts = name.split('/')
            assert not any(part in ('', '.', '..') for part in parts)
            assert not any(char in name for char in ('\\', ':', '\0'))
            assert parts[0].casefold() not in ('data', 'app')
            assert not any(part.casefold() == '.env' or part.casefold().endswith(('.key', '.key.pub')) for part in parts)
            info = package.getinfo(name)
            assert info.file_size == item['size']
            with package.open(name) as source:
                assert sha(source) == item['sha256'], f'Payload hash mismatch: {name}'
            expanded += item['size']
        assert expanded <= 4 * 1024**3
        assert 'worker/_internal/python312.dll' in names
        assert 'worker/_internal/silero_vad/data/silero_vad.onnx' in names
        assert 'webview2/msedgewebview2.exe' in names
        if production:
            verify_production_payload(package, os.environ.get('WANGAI_API_BASE_URL', ''),
                                      os.environ.get('WANGAI_UPDATER_PUBLIC_KEY', ''))
    with executable.open('rb') as source:
        source.seek(-40, 2)
        magic, offset, length, signature_length = struct.unpack('<16sQQQ', source.read(40))
        assert magic == b'WANGAI_PORTABLE1'
        assert length == archive.stat().st_size
        assert offset + length + signature_length + 40 == executable.stat().st_size
        source.seek(offset)
        digest = hashlib.sha256()
        remaining = length
        while remaining:
            block = source.read(min(1024**2, remaining))
            assert block
            digest.update(block)
            remaining -= len(block)
        with archive.open('rb') as archive_stream:
            assert digest.hexdigest() == sha(archive_stream), 'Embedded payload differs from updater archive'
        assert source.read(signature_length).decode() == Path(str(archive) + '.sig').read_text().strip()
    legacy = json.loads((folder / 'latest.json').read_text())
    legacy_source = Path(__file__).resolve().parent.parent / 'portable/legacy-0.2.2.json'
    assert (folder / 'latest.json').read_bytes() == legacy_source.read_bytes()
    assert legacy['version'] == '0.2.2'
    channel = json.loads((folder / 'latest-portable.json').read_text(encoding='utf8'))
    platform = channel['platforms']['windows-x86_64']
    assert channel['version'] == version
    assert platform['url'] == f'https://github.com/HectorRussia/wangai-overlay/releases/download/v{version}/{archive.name}'
    assert platform['signature'] == Path(str(archive) + '.sig').read_text().strip()
    if verifier:
        for file in (folder / 'package-manifest.json', archive, executable):
            subprocess.run([str(verifier), str(file), str(file) + '.sig'], check=True, timeout=120)
    return {'version': version, 'result': 'passed', 'files': len(manifest['files']),
            'expandedBytes': expanded, 'portableBytes': executable.stat().st_size,
            'cryptographicSignaturesVerified': verifier is not None, 'legacyVersion': legacy['version'],
            'productionIdentityVerified': production}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('folder', type=Path)
    parser.add_argument('--verifier', type=Path)
    parser.add_argument('--production', action='store_true', help='Require live gateway, non-test identity and expected public key from environment')
    args = parser.parse_args()
    print(json.dumps(audit(args.folder.resolve(), args.verifier, args.production), indent=2))
