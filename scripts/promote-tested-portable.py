"""One-time 0.3.0 metadata promotion; never rebuild, re-sign or overwrite a payload."""
import argparse
import hashlib
import json
import os
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = 'fc369ef501beff140b1bdeefca322bc8032e88bc'
TAG_COMMIT = '2d3d929e340d0c3ac8bcc331e3f20a6bd099d9f0'
RUN = '34682590667'
EXE_HASH = '2ca7cce804f673a3a5b17d05c21b12a2142a8f5e47ca0e505af477a0231326aa'
METADATA_ONLY = {'.github/workflows/release.yml', 'README.md',
                 'docs/portable-verification.md', 'docs/releases/v0.3.0.md',
                 'scripts/test-portable-preview.py'}


def digest(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def validate(provenance, manifest, changed, tag_commit, exe_hash):
    expected = {'kind': 'signed-portable-preview', 'version': '0.3.0',
                'repository': 'HectorRussia/wangai-overlay', 'commit': SOURCE,
                'ref': 'refs/heads/codex/portable-preview-0.3.0', 'runAttempt': 1,
                'workflowRun': f'https://github.com/HectorRussia/wangai-overlay/actions/runs/{RUN}',
                'gateway': 'https://wangai-ai.onrender.com'}
    if any(provenance.get(k) != v for k, v in expected.items()):
        raise ValueError('Unexpected preview provenance')
    if manifest.get('version') != '0.3.0' or manifest.get('architecture') != 'x86_64':
        raise ValueError('Unexpected package version or architecture')
    if tag_commit != TAG_COMMIT or not set(changed).issubset(METADATA_ONLY):
        raise ValueError('Tag changed or product/build inputs differ from tested preview')
    if exe_hash != EXE_HASH:
        raise ValueError('Not the exact owner-tested Portable executable')


def promote(source, output):
    def git(*args):
        return subprocess.check_output(['git', *args], cwd=ROOT).decode('utf8').strip()
    provenance = json.loads((source / 'PREVIEW-BUILD.json').read_text(encoding='utf8'))
    manifest = json.loads((source / 'package-manifest.json').read_text(encoding='utf8'))
    validate(provenance, manifest, git('diff', '--name-only', SOURCE, 'v0.3.0').splitlines(),
             git('rev-parse', 'v0.3.0^{commit}'), digest(source / 'WANGAI_0.3.0_x64-portable.exe'))
    if output.exists():
        raise ValueError('Use a new release output directory; never overwrite artifacts')
    output.mkdir(parents=True)
    for file in source.iterdir():
        if not file.is_file() or file.is_symlink():
            raise ValueError('Unexpected artifact entry')
        if file.name not in {'PREVIEW.md', 'SHA256SUMS.txt'}:
            shutil.copyfile(file, output / file.name)
    notes = git('show', 'v0.3.0:docs/releases/v0.3.0.md') + '\n\n' + (
        'Release provenance: the signed executable and update payload are unchanged from '
        f'the owner-tested CI preview ({SOURCE}, run {RUN}). Only release metadata was updated. '
        'PREVIEW-BUILD.json records the original build-time state, not the current publication status.\n')
    (output / 'RELEASE-NOTES.md').write_text(notes, encoding='utf8')
    channel = json.loads((output / 'latest-portable.json').read_text(encoding='utf8'))
    channel['notes'] = notes
    (output / 'latest-portable.json').write_text(json.dumps(channel, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    record = {'format': 1, 'kind': 'tested-preview-promotion', 'tag': 'v0.3.0',
              'tagCommit': TAG_COMMIT, 'sourceCommit': SOURCE, 'sourceRun': RUN,
              'promotionRun': os.environ.get('GITHUB_RUN_ID'),
              'promotionWorkflowCommit': os.environ.get('GITHUB_SHA'),
              'portableSha256': EXE_HASH, 'payloadBytesUnchanged': True,
              'ownerReportedWorking': True, 'cleanWindowsTested': False,
              'stableQaComplete': False}
    (output / 'RELEASE-PROVENANCE.json').write_text(json.dumps(record, indent=2) + '\n', encoding='utf8')
    for name in ('package-manifest.json', 'package-manifest.json.sig', 'WANGAI_0.3.0_x64-portable.exe',
                 'WANGAI_0.3.0_x64-portable.exe.sig', 'WANGAI_0.3.0_x64-update.zip',
                 'WANGAI_0.3.0_x64-update.zip.sig', 'latest.json'):
        if digest(source / name) != digest(output / name):
            raise ValueError(f'Protected artifact changed: {name}')
    with (output / 'SHA256SUMS.txt').open('w', encoding='utf8', newline='\n') as sums:
        for file in sorted(output.iterdir()):
            if file.name != 'SHA256SUMS.txt':
                sums.write(f'{digest(file)}  {file.name}\n')
    print('Prepared metadata only; tested payload and signatures unchanged. Not published.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    promote(args.source.resolve(), args.output.resolve())
