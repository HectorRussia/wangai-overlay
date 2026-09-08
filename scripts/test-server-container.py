"""Docker smoke using fake credentials and unreachable loopback upstreams. No paid AI."""
import json
import subprocess
import time
import urllib.request
import uuid

name = f'wangai-smoke-{uuid.uuid4().hex[:8]}'
def docker(*args):
    return subprocess.check_output(['docker', *args], text=True).strip()
docker('build', '-t', 'wangai-server:ci', '-f', 'server/Dockerfile', '.')
env = {
    'BIND_ADDRESS': '0.0.0.0:10000', 'DATABASE_PATH': '/data/usage.sqlite3',
    'STT_BASE_URL': 'http://127.0.0.1:9/v1', 'TRANSLATION_BASE_URL': 'http://127.0.0.1:9/v1',
    'STT_API_KEY': 'ci-only-no-provider-credential', 'TRANSLATION_API_KEY': 'ci-only-no-provider-credential',
    'STT_INCOMING_MODEL': 'ci-stt', 'STT_MICROPHONE_MODEL': 'ci-mic', 'TRANSLATION_MODEL': 'ci-chat',
}
try:
    docker('run', '-d', '--name', name, '-p', '127.0.0.1::10000',
           *(x for k, v in env.items() for x in ('-e', f'{k}={v}')), 'wangai-server:ci')
    address = docker('port', name, '10000/tcp').splitlines()[0]
    for attempt in range(30):
        try:
            with urllib.request.urlopen(f'http://{address}/healthz', timeout=2) as r:
                assert r.status == 200
            break
        except OSError:
            time.sleep(1)
    else:
        raise AssertionError('Container never became healthy')
    with urllib.request.urlopen(f'http://{address}/v1/status', timeout=5) as r:
        body = r.read().decode()
        assert 'ci-chat' in body and 'credential' not in body
    assert docker('exec', name, 'id', '-u') == '10001'
    docker('exec', name, 'test', '-w', '/data/usage.sqlite3')
    docker('exec', name, 'wangai-server', 'usage')
    started = time.monotonic()
    docker('stop', '-t', '150', name)
    assert time.monotonic() - started < 150
    assert 'ci-only-no-provider-credential' not in docker('logs', name)
    assert docker('inspect', '--format', '{{.State.ExitCode}}', name) == '0'
    print('Docker: health/status, non-root SQLite, redaction and SIGTERM shutdown passed')
finally:
    # Explicit unique container created by this script only. No volumes are created.
    subprocess.run(['docker', 'rm', '-f', name], check=False, capture_output=True)
