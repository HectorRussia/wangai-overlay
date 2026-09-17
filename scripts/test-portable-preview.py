"""Small offline tests for the preview-only CI guards (no signing keys)."""
import hashlib
import importlib.util
import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    loaded = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(loaded)
    return loaded


audit = module('audit', 'verify-portable-artifacts.py')
provenance = module('provenance', 'record-portable-preview.py')
promotion = module('promotion', 'promote-tested-portable.py')
GATEWAY = 'https://wangai-ai.onrender.com'


class Payload:
    def __init__(self, core=None, host=b'public-fixture'):
        self.files = {'gamelingo.exe': core if core is not None else (GATEWAY + ' public-fixture').encode(),
                      'WANGAI.exe': host}

    def read(self, name):
        return self.files[name]


class PreviewTests(unittest.TestCase):
    def test_release_checksum_guard_accepts_lf_and_crlf_but_rejects_corruption(self):
        script = Path(__file__).resolve().parent / 'release-assets.mjs'
        for newline in ('\n', '\r\n'):
            with self.subTest(newline=repr(newline)), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                assets = root / 'assets'
                assets.mkdir()
                (root / 'portable').mkdir()
                (root / 'package.json').write_text('{"version":"0.3.0"}')
                (root / 'portable/legacy-0.2.2.json').write_text('{"version":"0.2.2"}')
                for name in ('WANGAI_0.3.0_x64-portable.exe', 'WANGAI_0.3.0_x64-update.zip',
                             'WANGAI_0.3.0_x64-update.zip.sig', 'package-manifest.json',
                             'package-manifest.json.sig', 'windows-subsystems.json', 'webview2.lock.json'):
                    (assets / name).write_bytes(b'fixture')
                (assets / 'latest.json').write_text('{"version":"0.2.2"}')
                (assets / 'latest-portable.json').write_text(json.dumps({'version': '0.3.0', 'platforms': {
                    'windows-x86_64': {'url': 'https://github.com/HectorRussia/wangai-overlay/releases/download/v0.3.0/WANGAI_0.3.0_x64-update.zip'}}}))
                sums = newline.join(f'{hashlib.sha256(file.read_bytes()).hexdigest()}  {file.name}' for file in sorted(assets.iterdir())) + newline
                (assets / 'SHA256SUMS.txt').write_bytes(sums.encode())
                environment = {**os.environ, 'GITHUB_REF_NAME': 'v0.3.0'}
                def run():
                    return subprocess.run(['node', str(script), str(assets)], cwd=root, env=environment, capture_output=True, timeout=20)
                self.assertEqual(run().returncode, 0)
                (assets / 'WANGAI_0.3.0_x64-portable.exe').write_bytes(b'corrupt')
                self.assertNotEqual(run().returncode, 0)

    def test_promotion_requires_exact_tested_source_tag_and_payload(self):
        record = {'kind': 'signed-portable-preview', 'version': '0.3.0',
                  'repository': 'HectorRussia/wangai-overlay', 'commit': promotion.SOURCE,
                  'ref': 'refs/heads/codex/portable-preview-0.3.0', 'runAttempt': 1,
                  'workflowRun': f'https://github.com/HectorRussia/wangai-overlay/actions/runs/{promotion.RUN}',
                  'gateway': GATEWAY}
        manifest = {'version': '0.3.0', 'architecture': 'x86_64'}
        promotion.validate(record, manifest, ['README.md'], promotion.TAG_COMMIT, promotion.EXE_HASH)
        for changed, tag, digest in [(['src/ReadyRoom.tsx'], promotion.TAG_COMMIT, promotion.EXE_HASH),
                                     ([], 'a' * 40, promotion.EXE_HASH), ([], promotion.TAG_COMMIT, 'bad')]:
            with self.assertRaises(ValueError):
                promotion.validate(record, manifest, changed, tag, digest)
        with self.assertRaises(ValueError):
            promotion.validate({**record, 'commit': 'b' * 40}, manifest, [], promotion.TAG_COMMIT, promotion.EXE_HASH)

    def test_release_stays_draft_prerelease_and_verifies_before_creation(self):
        workflow = (Path(__file__).resolve().parent.parent / '.github/workflows/release.yml').read_text()
        create = next(line for line in workflow.splitlines() if 'gh release create ' in line)
        for flag in ('--verify-tag', '--draft', '--prerelease', '--latest=false'):
            self.assertIn(flag, create)
        self.assertIn('--production', workflow)
        self.assertLess(workflow.index('scripts/verify-portable-artifacts.py'), workflow.index('gh release create '))
        self.assertNotIn('gh release edit', workflow)

    def test_accepts_live_identity_and_matching_keys(self):
        audit.verify_production_payload(Payload(), GATEWAY + '/', ' public-fixture ')

    def test_rejects_test_endpoint_and_identity(self):
        for marker in ('https://127.0.0.1:19439', 'dev.gamelingo.overlay.release-test'):
            with self.subTest(marker=marker), self.assertRaises(AssertionError):
                audit.verify_production_payload(Payload(core=(GATEWAY + ' public-fixture ' + marker).encode()), GATEWAY, 'public-fixture')

    def test_rejects_missing_live_gateway(self):
        with self.assertRaises(AssertionError):
            audit.verify_production_payload(Payload(core=b'public-fixture'), GATEWAY, 'public-fixture')

    def test_rejects_wrong_or_missing_expected_values(self):
        for gateway, key in [('', 'public-fixture'), ('https://127.0.0.1', 'public-fixture'), (GATEWAY, '')]:
            with self.subTest(gateway=gateway, key=key), self.assertRaises(AssertionError):
                audit.verify_production_payload(Payload(), gateway, key)

    def test_rejects_mismatched_launcher_key(self):
        with self.assertRaises(AssertionError):
            audit.verify_production_payload(Payload(host=b'different-key'), GATEWAY, 'public-fixture')

    def environment(self):
        return {'GITHUB_REPOSITORY': 'HectorRussia/wangai-overlay', 'GITHUB_SHA': 'a' * 40,
                'GITHUB_REF': 'refs/heads/codex/portable-preview-0.3.0', 'GITHUB_RUN_ID': '123',
                'GITHUB_RUN_ATTEMPT': '1', 'WANGAI_API_BASE_URL': GATEWAY,
                'TAURI_SIGNING_PRIVATE_KEY_PASSWORD': 'NEVER-RECORD-THIS-FIXTURE-VALUE'}

    def test_records_only_public_metadata_and_refreshes_hashes(self):
        with tempfile.TemporaryDirectory() as temporary, patch.dict(os.environ, self.environment(), clear=True):
            root = Path(temporary)
            (root / 'package-manifest.json').write_text('{"version":"0.3.0"}')
            (root / 'payload.zip').write_bytes(b'fixture')
            provenance.record(root)
            record = json.loads((root / 'PREVIEW-BUILD.json').read_text())
            self.assertFalse(record['published'])
            self.assertFalse(record['thisArtifactFirstLaunchTested'])
            self.assertNotIn('NEVER-RECORD', (root / 'PREVIEW-BUILD.json').read_text())
            for line in (root / 'SHA256SUMS.txt').read_text().splitlines():
                digest, name = line.split('  ', 1)
                self.assertEqual(digest, hashlib.sha256((root / name).read_bytes()).hexdigest())
            with self.assertRaises(FileExistsError):
                provenance.record(root)

    def test_refuses_wrong_repo_ref_commit_or_run_without_writing(self):
        for field, value in [('GITHUB_REPOSITORY', 'someone/fork'), ('GITHUB_REF', 'refs/heads/main'),
                             ('GITHUB_SHA', 'bad'), ('GITHUB_RUN_ID', '../x'), ('WANGAI_API_BASE_URL', 'https://127.0.0.1')]:
            environment = self.environment()
            environment[field] = value
            with tempfile.TemporaryDirectory() as temporary, patch.dict(os.environ, environment, clear=True):
                with self.subTest(field=field), self.assertRaises(ValueError):
                    provenance.record(Path(temporary))
                self.assertEqual(list(Path(temporary).iterdir()), [])


if __name__ == '__main__':
    unittest.main()
