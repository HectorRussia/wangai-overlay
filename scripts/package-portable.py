"""Build one signed payload, then embed those exact bytes into the native host.

Uses only Python stdlib. Reads explicit program roots, never a developer Data/profile
directory. Signing credentials remain inherited environment variables, never logged.
"""
import argparse, hashlib, json, os, shutil, struct, subprocess, zipfile
from pathlib import Path
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parent.parent
REPO = 'https://github.com/HectorRussia/wangai-overlay/releases/download'

def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

def pe_subsystem(path):
    with path.open('rb') as stream:
        dos=stream.read(64)
        if len(dos)!=64 or dos[:2]!=b'MZ': raise ValueError(f'Invalid PE: {path.name}')
        stream.seek(struct.unpack_from('<I',dos,60)[0]); pe=stream.read(94)
        if len(pe)!=94 or pe[:4]!=b'PE\0\0' or struct.unpack_from('<H',pe,4)[0]!=0x8664: raise ValueError(f'Not x64 PE: {path.name}')
        return struct.unpack_from('<H',pe,92)[0]

def collect(directory,prefix,files):
    for file in sorted(directory.rglob('*')):
        if file.is_symlink() or getattr(file.lstat(),'st_file_attributes',0)&0x400: raise ValueError('Package reparse point rejected')
        if not file.is_file(): continue
        relative=file.relative_to(directory).as_posix()
        name=f'{prefix}/{relative}'
        # Silero's model lives in lowercase silero_vad/data: that is program data,
        # not the Portable root Data/ directory (which is never an input root).
        if any(p == 'Data' or p.lower() in {'.git','.env','__pycache__'} or p.lower().endswith(('.key','.key.pub')) for p in file.relative_to(directory).parts): raise ValueError(f'Forbidden package file: {name}')
        if name.casefold() in {n.casefold() for n in files}: raise ValueError(f'Duplicate package file: {name}')
        files[name]=file

def sign(path,verifier):
    env=os.environ.copy()
    if env.get('TAURI_SIGNING_PRIVATE_KEY'): env.pop('TAURI_SIGNING_PRIVATE_KEY_PATH',None)
    result=subprocess.run(['node',str(ROOT/'node_modules/@tauri-apps/cli/tauri.js'),'signer','sign',str(path)],cwd=ROOT,capture_output=True,env=env)
    if result.returncode: raise RuntimeError('Signing failed; check configured key/password (command output suppressed)')
    signature=Path(str(path)+'.sig').read_text().strip()
    if not signature: raise RuntimeError('Empty signature')
    subprocess.run([str(verifier),str(path),str(path)+'.sig'],check=True)
    return signature

def build(args):
    output=args.output.resolve()
    if output.exists() and any(output.iterdir()): raise ValueError('Choose an empty artifact directory; existing artifacts are never overwritten')
    output.mkdir(parents=True,exist_ok=True)
    version=args.version or json.loads((ROOT/'package.json').read_text())['version']
    import re
    if not re.fullmatch(r'0\.3\.[01]',version): raise ValueError('Unsupported build version')
    pin=json.loads((ROOT/'portable/webview2.lock.json').read_text())
    files={'WANGAI.exe':args.host.resolve(),'gamelingo.exe':args.core.resolve(),'THIRD-PARTY-NOTICES.md':ROOT/'docs/THIRD-PARTY-NOTICES.md'}
    collect(ROOT/'output/worker/wangai-worker','worker',files)
    collect(ROOT/'dist','web',files)
    collect(args.runtime.resolve(),'webview2',files)
    for required in ['web/index.html','worker/wangai-worker.exe','webview2/msedgewebview2.exe']:
        if required not in files: raise ValueError(f'Missing {required}')
    audit={name:pe_subsystem(file) for name,file in files.items() if name.lower().endswith('.exe')}
    for name in ['WANGAI.exe','gamelingo.exe']:
        if audit[name]!=2: raise ValueError(f'Console entrypoint is forbidden: {name}')
    # Python/worker utility executables may be CUI. The core launches its worker
    # with CREATE_NO_WINDOW and redirected pipes; none is a user entrypoint.
    manifest={'format':1,'product':'dev.gamelingo.overlay.portable','version':version,'architecture':'x86_64','bootstrapMin':1,'bootstrapMax':1,'webviewVersion':pin['version'],
        'files':{name:{'size':file.stat().st_size,'sha256':digest(file)} for name,file in sorted(files.items())}}
    if sum(v['size'] for v in manifest['files'].values())>4*1024**3: raise ValueError('Expanded package exceeds 4 GiB')
    manifest_file=output/'package-manifest.json';manifest_file.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    sign(manifest_file,args.verifier)
    payload=output/f'WANGAI_{version}_x64-update.zip'
    with zipfile.ZipFile(payload,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=6,allowZip64=True,strict_timestamps=False) as archive:
        for name,file in sorted(files.items()): archive.write(file,name)
        archive.write(manifest_file,manifest_file.name)
        archive.write(Path(str(manifest_file)+'.sig'),manifest_file.name+'.sig')
    if payload.stat().st_size>1024**3: raise ValueError('Archive exceeds 1 GiB')
    signature=sign(payload,args.verifier)
    portable=output/f'WANGAI_{version}_x64-portable.exe'
    with portable.open('xb') as dest:
        with args.host.open('rb') as source: shutil.copyfileobj(source,dest)
        offset=dest.tell()
        with payload.open('rb') as source: shutil.copyfileobj(source,dest)
        sig=signature.encode('utf8');dest.write(sig)
        dest.write(struct.pack('<16sQQQ',b'WANGAI_PORTABLE1',offset,payload.stat().st_size,len(sig)))
    sign(portable,args.verifier)
    notes=(ROOT/'docs/releases/v0.3.0.md').read_text(encoding='utf8')
    (output/'RELEASE-NOTES.md').write_text(notes,encoding='utf8')
    channel={'version':version,'notes':notes,'pub_date':datetime.now(timezone.utc).isoformat(),'platforms':{'windows-x86_64':{'url':f'{REPO}/v{version}/{payload.name}','signature':signature}}}
    (output/'latest-portable.json').write_text(json.dumps(channel,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    shutil.copyfile(ROOT/'portable/legacy-0.2.2.json',output/'latest.json')
    (output/'windows-subsystems.json').write_text(json.dumps(audit,indent=2)+'\n',encoding='utf8')
    shutil.copyfile(ROOT/'portable/webview2.lock.json',output/'webview2.lock.json')
    (output/'SHA256SUMS.txt').write_text(''.join(f'{digest(file)}  {file.name}\n' for file in sorted(output.iterdir()) if file.is_file()),encoding='utf8')
    print(f'Prepared {portable.name}: {portable.stat().st_size:,} bytes. Not published.')

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    for name in ('core','host','runtime','output','verifier'): parser.add_argument('--'+name,type=Path,required=True)
    parser.add_argument('--version')
    build(parser.parse_args())
