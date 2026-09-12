"""Record public CI provenance for an already audited preview; never publish it."""
import argparse
import hashlib
import json
import os
import re
from pathlib import Path


def record(folder):
    repository = os.environ.get('GITHUB_REPOSITORY')
    commit = os.environ.get('GITHUB_SHA', '')
    ref = os.environ.get('GITHUB_REF', '')
    run_id = os.environ.get('GITHUB_RUN_ID', '')
    attempt = os.environ.get('GITHUB_RUN_ATTEMPT', '')
    if repository != 'HectorRussia/wangai-overlay' or ref != 'refs/heads/codex/portable-preview-0.3.0':
        raise ValueError('Preview provenance is restricted to the dedicated preview branch')
    if not re.fullmatch(r'[0-9a-f]{40}', commit) or not run_id.isdecimal() or not attempt.isdecimal():
        raise ValueError('Missing or invalid CI provenance')
    if os.environ.get('WANGAI_API_BASE_URL', '').rstrip('/') != 'https://wangai-ai.onrender.com':
        raise ValueError('Preview must use the live gateway')
    manifest = json.loads((folder / 'package-manifest.json').read_text(encoding='utf8'))
    if manifest['version'] != '0.3.0':
        raise ValueError('Unexpected preview version')
    provenance = {
        'format': 1, 'kind': 'signed-portable-preview', 'version': manifest['version'],
        'repository': repository, 'commit': commit, 'ref': ref,
        'workflowRun': f'https://github.com/{repository}/actions/runs/{run_id}',
        'runAttempt': int(attempt), 'gateway': 'https://wangai-ai.onrender.com',
        'published': False, 'cleanWindowsTested': False,
        'thisArtifactFirstLaunchTested': False, 'liveTranslationTested': False,
    }
    with (folder / 'PREVIEW-BUILD.json').open('x', encoding='utf8') as stream:
        json.dump(provenance, stream, ensure_ascii=False, indent=2)
        stream.write('\n')
    with (folder / 'PREVIEW.md').open('x', encoding='utf8') as stream:
        stream.write('# WANGAI 0.3.0 — Preview เท่านั้น\n\n'
                     'ชุดนี้ต่อเซิร์ฟเวอร์ WANGAI จริงและลงนามด้วยกุญแจเดิม แต่ยังไม่ใช่ release ที่เผยแพร่\n'
                     'เปิด WANGAI_0.3.0_x64-portable.exe แล้วเลือกโฟลเดอร์ใหม่ ไม่ทับชุดทดสอบหรือ Data เดิม\n'
                     'ปิด WANGAI ชุดอื่นก่อน หลังเตรียมไฟล์ให้เปิด WANGAI.exe ในโฟลเดอร์ที่เลือก\n'
                     'ไม่ต้องกรอก API key บนเครื่องผู้ใช้ การแปลจริงอาจมีค่าใช้จ่ายฝั่งบริการ\n\n'
                     'ยังต้องตรวจ clean Windows, การเปิด artifact นี้จริง และการแปลเสียงก่อนเผยแพร่\n'
                     'Actions artifact ไม่ได้สร้าง tag/release และไม่อัปเดตช่องทางดาวน์โหลดอัตโนมัติ\n')
    with (folder / 'SHA256SUMS.txt').open('w', encoding='utf8') as stream:
        for file in sorted(folder.iterdir()):
            if file.is_file() and file.name != 'SHA256SUMS.txt':
                with file.open('rb') as source:
                    digest = hashlib.file_digest(source, 'sha256').hexdigest()
                stream.write(f'{digest}  {file.name}\n')
    print(f'Preview provenance recorded for {commit}; not published.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('folder', type=Path)
    record(parser.parse_args().folder.resolve())
