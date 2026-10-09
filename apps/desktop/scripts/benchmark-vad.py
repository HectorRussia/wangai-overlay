"""Measure a warmed VAD process on Windows; optionally compare an existing legacy venv."""
import argparse
import ctypes
from ctypes import wintypes
import json
from pathlib import Path
import subprocess
import sys
import os
import time


def working_set(pid):
    class Counters(ctypes.Structure):
        _fields_ = [('cb', wintypes.DWORD), ('PageFaultCount', wintypes.DWORD)] + [
            (name, ctypes.c_size_t) for name in ('PeakWorkingSetSize', 'WorkingSetSize', 'QuotaPeakPagedPoolUsage', 'QuotaPagedPoolUsage', 'QuotaPeakNonPagedPoolUsage', 'QuotaNonPagedPoolUsage', 'PagefileUsage', 'PeakPagefileUsage', 'PrivateUsage')]

    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    psapi = ctypes.WinDLL('psapi', use_last_error=True)
    kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
    kernel.OpenProcess.restype = wintypes.HANDLE
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    psapi.GetProcessMemoryInfo.argtypes = [wintypes.HANDLE, ctypes.POINTER(Counters), wintypes.DWORD]
    handle = kernel.OpenProcess(0x0400 | 0x0010, False, pid)
    if not handle:
        raise ctypes.WinError(ctypes.get_last_error())
    try:
        counters = Counters()
        counters.cb = ctypes.sizeof(counters)
        if not psapi.GetProcessMemoryInfo(handle, ctypes.byref(counters), counters.cb):
            raise ctypes.WinError(ctypes.get_last_error())
        return round(counters.WorkingSetSize / 1024**2, 1)
    finally:
        kernel.CloseHandle(handle)


def measure(legacy):
    code = '''
import sys
import os
import numpy as np
from importlib.metadata import version
if sys.argv[1] == 'legacy':
    import torch
    from silero_vad import load_silero_vad
    model = load_silero_vad(onnx=True)
    model(torch.zeros(512), 16000)
else:
    from worker.wangai_worker.silero_onnx import SileroOnnx
    model = SileroOnnx()
    model(np.zeros(512, dtype=np.float32), 16000)
model.reset_states()
print(os.getpid(), flush=True)
sys.stdin.read()
'''
    child = subprocess.Popen([sys.executable, '-c', code, 'legacy' if legacy else 'direct'], cwd=Path(__file__).resolve().parents[1], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, creationflags=subprocess.CREATE_NO_WINDOW, text=True)
    try:
        line = child.stdout.readline().strip()
        if not line.isdecimal():
            raise RuntimeError(child.stderr.read())
        time.sleep(0.25)
        # uv's Windows venv executable can be a redirector with its own tiny working set.
        return working_set(int(line))
    finally:
        child.communicate(timeout=5)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--compare-legacy', action='store_true')
    args = parser.parse_args()
    result = {'metric': 'VAD process working set MiB after warmup', 'direct_onnx_mib': measure(False)}
    if args.compare_legacy:
        result['legacy_wrapper_mib'] = measure(True)
    print(json.dumps(result, indent=2))
