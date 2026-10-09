"""Download multilingual Q5 models from a pinned upstream revision, verifying SHA-256."""
import argparse
import hashlib
from pathlib import Path
import urllib.request

REVISION = "5359861c739e955e79d9a303bcbc70fb988958b1"
MODELS = {
    "base": "422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898",
}


def digest(path):
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", choices=MODELS, default="base")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1] / "output/models"
    root.mkdir(parents=True, exist_ok=True)
    target = root / f"ggml-{args.model}-q5_1.bin"
    expected = MODELS[args.model]
    if target.is_file() and digest(target) == expected:
        print(f"Verified {target.name}")
        return
    temporary = target.with_suffix(".download")
    try:
        urllib.request.urlretrieve(f"https://huggingface.co/ggerganov/whisper.cpp/resolve/{REVISION}/{target.name}", temporary)
        if digest(temporary) != expected:
            raise ValueError("Whisper checksum mismatch; existing model was not replaced")
        temporary.replace(target)
    finally:
        temporary.unlink(missing_ok=True)
    print(f"Verified {target.name}")


if __name__ == "__main__":
    main()
