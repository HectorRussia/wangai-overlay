"""Small offline tests for the preview-only CI guards (no signing keys)."""
import hashlib
import importlib.util
import json
import os
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
GATEWAY = 'https://wangai-ai.onrender.com'


class Payload:
    def __init__(self, core=None, host=b'public-fixture'):
        self.files = {'gamelingo.exe': core if core is not None else (GATEWAY + ' public-fixture').encode(),
                      'WANGAI.exe': host}

    def read(self, name):
        return self.files[name]


class PreviewTests(unittest.TestCase):
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
