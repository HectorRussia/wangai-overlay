"""Offline artifact layout regression: no real signing keys or executable launches."""
import importlib.util
import json
from pathlib import Path
import struct
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import zipfile

spec = importlib.util.spec_from_file_location(
    "portable_packaging", Path(__file__).with_name("package-portable.py")
)
packaging = importlib.util.module_from_spec(spec)
spec.loader.exec_module(packaging)


def fake_pe(subsystem):
    data = bytearray(158)
    data[:2] = b"MZ"
    struct.pack_into("<I", data, 60, 64)
    data[64:68] = b"PE\0\0"
    struct.pack_into("<H", data, 68, 0x8664)
    struct.pack_into("<H", data, 156, subsystem)
    return bytes(data)


def fixture_sign(path, _verifier):
    signature = "unsigned-test-fixture:" + packaging.digest(path)
    Path(str(path) + ".sig").write_text(signature, encoding="utf-8")
    return signature


class PackageLayoutTests(unittest.TestCase):
    def test_payload_manifest_embedded_bytes_and_release_metadata_agree(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "apps" / "desktop"
            inputs = {
                "package.json": b'{"version":"0.5.0"}',
                "../../docs/releases/v0.5.0.md": b"Fixture release notes",
                "../../docs/THIRD-PARTY-NOTICES.md": b"Fixture notices",
                "portable/webview2.lock.json": b'{"version":"1.2.3"}',
                "portable/legacy-0.2.2.json": b'{"version":"0.2.2"}',
                "host.exe": fake_pe(2),
                "core.exe": fake_pe(2),
                "output/worker/wangai-worker/wangai-worker.exe": fake_pe(3),
                "output/worker/wangai-worker/_internal/silero_vad/data/model.onnx": b"model",
                "dist/index.html": b"<main>Fixture</main>",
                "runtime/msedgewebview2.exe": fake_pe(2),
            }
            for name, content in inputs.items():
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(content)
            output = root / "artifacts"
            args = SimpleNamespace(
                output=output, version=None, host=root / "host.exe",
                core=root / "core.exe", runtime=root / "runtime", verifier=root / "unused",
            )
            with patch.object(packaging, "ROOT", root), patch.object(packaging, "sign", fixture_sign):
                packaging.build(args)
                with self.assertRaisesRegex(ValueError, "empty artifact directory"):
                    packaging.build(args)
            payload = output / "WANGAI_0.5.0_x64-update.zip"
            manifest = json.loads((output / "package-manifest.json").read_text())
            with zipfile.ZipFile(payload) as archive:
                self.assertEqual(json.loads(archive.read("package-manifest.json")), manifest)
                self.assertEqual(archive.read("gamelingo.exe"), inputs["core.exe"])
                self.assertEqual(archive.read("worker/_internal/silero_vad/data/model.onnx"), b"model")
                self.assertEqual(set(archive.namelist()), set(manifest["files"]) | {"package-manifest.json", "package-manifest.json.sig"})
            portable = (output / "WANGAI_0.5.0_x64-portable.exe").read_bytes()
            magic, offset, length, signature_length = struct.unpack("<16sQQQ", portable[-40:])
            self.assertEqual(magic, b"WANGAI_PORTABLE1")
            self.assertEqual(portable[:offset], inputs["host.exe"])
            self.assertEqual(portable[offset:offset + length], payload.read_bytes())
            signature = portable[offset + length:-40].decode()
            self.assertEqual(len(signature.encode()), signature_length)
            channel = json.loads((output / "latest-portable.json").read_text())
            self.assertEqual(channel["platforms"]["windows-x86_64"]["signature"], signature)
            self.assertTrue(channel["platforms"]["windows-x86_64"]["url"].endswith(payload.name))
            for line in (output / "SHA256SUMS.txt").read_text().splitlines():
                digest, name = line.split("  ", 1)
                self.assertEqual(packaging.digest(output / name), digest)


if __name__ == "__main__":
    unittest.main()
