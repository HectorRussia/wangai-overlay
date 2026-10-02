"""Stable source/PyInstaller entrypoint for the local VAD worker."""

import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

if __package__:
    from .wangai_worker.runtime import parse_args, run, self_test
else:
    from wangai_worker.runtime import parse_args, run, self_test

if __name__ == "__main__":
    parsed = parse_args()
    raise SystemExit(self_test() if parsed.self_test else run(parsed))
