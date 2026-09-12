"""Opt-in real Portable 0.3.0 -> 0.3.1 acceptance harness (no installer/AI).

Uses test-only core commands to confirm download, but production transaction,
streaming, signatures, helper, job, worker and rendered Ready Room are real.
Never removes an installation or stops a process by name. Leaves fixtures/reports.
Run the same command on a disposable standard-user Windows 10/11 VM for clean QA.
"""
import argparse,ctypes,functools,hashlib,http.server,json,os,subprocess,threading,time,uuid
from pathlib import Path

def wait(predicate,seconds=300):
    end=time.monotonic()+seconds
    while time.monotonic()<end:
        result=predicate()
        if result:return result
        time.sleep(.25)
    raise AssertionError('Timed out; test folders/processes retained for inspection')

def read(path):
    try:return json.loads(path.read_text(encoding='utf-8'))
    except (OSError,ValueError):return {}

def alive(pid):
    kernel=ctypes.WinDLL('kernel32',use_last_error=True)
    kernel.OpenProcess.restype=ctypes.c_void_p
    kernel.OpenProcess.argtypes=[ctypes.c_uint32,ctypes.c_int,ctypes.c_uint32]
    kernel.GetExitCodeProcess.argtypes=[ctypes.c_void_p,ctypes.POINTER(ctypes.c_uint32)]
    kernel.CloseHandle.argtypes=[ctypes.c_void_p]
    handle=kernel.OpenProcess(0x1000,False,pid)
    if not handle:return False
    code=ctypes.c_uint32();ok=kernel.GetExitCodeProcess(handle,ctypes.byref(code));kernel.CloseHandle(handle)
    return bool(ok and code.value==259)

def write(path,value):
    # Fixture files only, never production settings or signing material.
    path.write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding='utf8')

def file_hash(path):
    with path.open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--artifacts',type=Path,required=True)
    parser.add_argument('--run-test-product',action='store_true',required=True)
    parser.add_argument('--rollback',action='store_true')
    parser.add_argument('--manual-confirmation',action='store_true');args=parser.parse_args()
    if args.rollback and args.manual_confirmation:parser.error('Run manual confirmation and rollback separately')
    artifacts=args.artifacts.resolve()
    # Read-only guard prevents a fixture from interfering with a user's real app.
    check=subprocess.run(['powershell.exe','-NoProfile','-NonInteractive','-Command','if (Get-Process -Name gamelingo -ErrorAction SilentlyContinue) { exit 1 }; exit 0'],timeout=15)
    if check.returncode:raise SystemExit('Close WANGAI before isolated QA. No process was stopped.')
    for version in ('0.3.0','0.3.1'):
        if not (artifacts/f'v{version}/WANGAI_{version}_x64-portable.exe').is_file():raise SystemExit('Build both isolated Portable fixtures first')
    launcher_hashes={v:read(artifacts/f'v{v}/package-manifest.json')['files']['WANGAI.exe']['sha256'] for v in ('0.3.0','0.3.1')}
    assert launcher_hashes['0.3.0']!=launcher_hashes['0.3.1'],'Build distinct launcher versions to exercise launcher replacement'
    root=artifacts/f'ทดสอบ Portable {uuid.uuid4()}'
    for folder in ('Data','App/.update','App/versions'):(root/folder).mkdir(parents=True,exist_ok=True)
    write(root/'App/portable.json',{'format':1,'product':'dev.gamelingo.overlay.portable'})
    control={'0.3.0':'smoke','0.3.1':'smoke','_headless':True};write(root/'Data/test-control.json',control)
    signature=(artifacts/'v0.3.1/WANGAI_0.3.1_x64-update.zip.sig').read_text().strip()
    manifest={'version':'0.3.1','notes':'Isolated Portable QA','platforms':{'windows-x86_64':{'url':'http://127.0.0.1:19438/v0.3.1/WANGAI_0.3.1_x64-update.zip','signature':signature}}}
    downloads=[]
    class Handler(http.server.SimpleHTTPRequestHandler):
        def log_message(self,*_):pass
        def do_GET(self):
            if self.path.endswith('.zip'):downloads.append(self.path)
            if self.path=='/latest-portable.json':
                payload=json.dumps(manifest).encode();self.send_response(200);self.send_header('Content-Length',str(len(payload)));self.end_headers();self.wfile.write(payload)
            else:super().do_GET()
    server=http.server.ThreadingHTTPServer(('127.0.0.1',19438),functools.partial(Handler,directory=artifacts))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    try:
        # Inherited development runtime/profile must be ignored by the Portable core.
        env=os.environ.copy();env['WEBVIEW2_BROWSER_EXECUTABLE_FOLDER']=str(root/'missing-runtime');env['WEBVIEW2_USER_DATA_FOLDER']=str(root/'wrong-profile')
        prepared=subprocess.run([str(artifacts/'v0.3.0/WANGAI_0.3.0_x64-portable.exe'),'--test-prepare',str(root)],env=env,timeout=600)
        assert prepared.returncode==0, f'Initial preparation failed; inspect {root / "Data/test-startup.json"} and test-report-0.3.0.json'
        before=wait(lambda:read(root/'Data/test-report-0.3.0.json'))
        wait(lambda:not alive(before['pid']) and not alive(before['workerPid']))
        baseline=read(root/'Data/settings.json')
        assert before['workerReady'] and before['uiReady']
        assert any(p.lower().endswith('webview2\\msedgewebview2.exe') for p in before['childPaths']),'Bundled WebView2 was not observed'
        # MSIX-hosted development shells can expose the same directory through
        # a virtualized LocalAppData path. Compare file identity, not spelling.
        assert Path(before['profileFolder']).samefile(root/'Data/WebView2')
        assert not (root/'wrong-profile').exists()
        assert not downloads, 'Startup check downloaded an update without confirmation'
        assert file_hash(root/'WANGAI.exe')==launcher_hashes['0.3.0']
        # Non-default fixture preferences exercise persistence, without selecting
        # or capturing any of the user's real apps/microphone.
        baseline['glossary'].append({'source':'portable QA','target':'ทดสอบการเก็บค่าภาษาไทย'})
        baseline['vad']['processTree']['vadThreshold']=0.63
        baseline['overlay']['fontScale']=1.2
        baseline['overlay']['opacity']=0.84
        baseline['hotkeys']['copyLatest']='Control+Shift+F10'
        baseline['autoAttach']=False
        write(root/'Data/settings.json',baseline)
        control['0.3.0']='manual' if args.manual_confirmation else 'upgrade';control['0.3.1']='fail-ready' if args.rollback else 'smoke';write(root/'Data/test-control.json',control)
        started=time.time();subprocess.Popen([str(root/'WANGAI.exe')],env=env)
        if args.manual_confirmation:print(json.dumps({'action':'confirm-update-in-desktop-ui','root':str(root)}),flush=True)
        if args.rollback:
            wait(lambda:read(root/'App/active.json').get('current')=='0.3.1',600)
            assert file_hash(root/'WANGAI.exe')==launcher_hashes['0.3.1']
            replaced_pid=read(root/'Data/test-report-0.3.0.json')['pid']
            control['0.3.0']='smoke';write(root/'Data/test-control.json',control)
            wait(lambda:read(root/'App/active.json').get('current')=='0.3.0',180)
            wait(lambda:read(root/'Data/portable-test-error.json'),180)
            after=wait(lambda:(report if (report:=read(root/'Data/test-report-0.3.0.json')).get('pid') not in (None,replaced_pid) else None),180)
            assert '90' in read(root/'Data/portable-test-error.json')['error']
        else:
            after=wait(lambda:read(root/'Data/test-report-0.3.1.json'),900)
            wait(lambda:not (root/'App/transaction.json').exists())
            assert read(root/'App/active.json')=={'format':1,'current':'0.3.1','previous':'0.3.0'}
        wait(lambda:not alive(after['pid']) and not alive(after['workerPid']))
        assert after['workerReady'] and after['uiReady']
        assert read(root/'Data/settings.json')==baseline,'Settings/installation ID changed'
        expected_launcher=launcher_hashes['0.3.0' if args.rollback else '0.3.1']
        assert file_hash(root/'WANGAI.exe')==expected_launcher,'Launcher was not replaced/restored correctly'
        old=read(root/'Data/test-report-0.3.0.json')
        assert not alive(old['pid']) and not alive(old['workerPid'])
        result={'result':'passed','scenario':'rollback' if args.rollback else 'upgrade','root':str(root),'seconds':round(time.time()-started,1),'before':before,'after':after,'cleanWindows':False,'realUserConfirmationClick':False,'manualUiConfirmation':args.manual_confirmation,'launcherHashes':launcher_hashes,'finalLauncherSha256':expected_launcher,'noDownloadBeforeConfirmation':True}
        write(root/'Data/acceptance-report.json',result)
        print(json.dumps({'result':'passed','scenario':result['scenario'],'report':str(root/'Data/acceptance-report.json')}))
    finally:server.shutdown()

if __name__=='__main__':main()
