//! Native Win32 preparation/recovery screen. This module never loads WebView2.
use crate::host::{Task,Progress,Reporter};
use anyhow::Result;
use std::{path::PathBuf,sync::{Arc,atomic::{AtomicBool,Ordering},mpsc},thread};
use windows::{core::{w,PCWSTR},Win32::{Foundation::*,Graphics::Gdi::*,System::{Com::*,LibraryLoader::*},UI::{Controls::*,HiDpi::*,Shell::*,WindowsAndMessaging::*}}};
use wangai_portable::platform::wide;
use windows::Win32::UI::Input::KeyboardAndMouse::{EnableWindow,SetFocus};
#[allow(non_snake_case)]
unsafe fn SendMessageW(hwnd:HWND,msg:u32,wparam:WPARAM,lparam:LPARAM)->LRESULT {
    windows::Win32::UI::WindowsAndMessaging::SendMessageW(hwnd,msg,Some(wparam),Some(lparam))
}

const BG:COLORREF=COLORREF(0x00181614);
const GREEN:COLORREF=COLORREF(0x00a0dd76);
struct View {
    task:Task,root:PathBuf,children:Vec<HWND>,font:HFONT,heading:HFONT,brush:HBRUSH,
    receiver:Option<mpsc::Receiver<Progress>>,cancel:Arc<AtomicBool>,busy:bool,cancellable:bool,dpi:u32,
}
pub fn error(message:&str) { error_owned(None,message); }
fn error_owned(owner:Option<HWND>,message:&str) { unsafe { MessageBoxW(owner,PCWSTR(wide(message).as_ptr()),w!("WANGAI"),MB_OK|MB_ICONINFORMATION); } }
pub fn run(task:Task,root:PathBuf) -> Result<()> { unsafe {
    let _=SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
    CoInitializeEx(None,COINIT_APARTMENTTHREADED).ok()?;
    let _=InitCommonControlsEx(&INITCOMMONCONTROLSEX{dwSize:std::mem::size_of::<INITCOMMONCONTROLSEX>() as u32,dwICC:ICC_PROGRESS_CLASS});
    let instance=GetModuleHandleW(None)?;
    let class=w!("WANGAI.Portable.Host.1");
    let brush=CreateSolidBrush(BG);
    let wc=WNDCLASSW{lpfnWndProc:Some(procedure),hInstance:instance.into(),lpszClassName:class,hbrBackground:brush,hCursor:LoadCursorW(None,IDC_ARROW)?,hIcon:LoadIconW(Some(instance.into()),PCWSTR(1usize as *const u16)).unwrap_or_default(),..Default::default()};
    RegisterClassW(&wc);
    let dpi=GetDpiForSystem();
    let mut view=Box::new(View{task,root,children:vec![],font:HFONT::default(),heading:HFONT::default(),brush,receiver:None,cancel:Arc::new(AtomicBool::new(false)),busy:false,cancellable:true,dpi});
    let hwnd=CreateWindowExW(WS_EX_CONTROLPARENT,class,w!("WANGAI Portable"),WS_OVERLAPPED|WS_CAPTION|WS_SYSMENU|WS_MINIMIZEBOX|WS_CLIPCHILDREN,
        CW_USEDEFAULT,CW_USEDEFAULT,740*dpi as i32/96,510*dpi as i32/96,None,None,Some(instance.into()),None)?;
    SetWindowLongPtrW(hwnd,GWLP_USERDATA,&mut *view as *mut View as isize);
    let control=|class:PCWSTR,label:&str,id:usize,style:WINDOW_STYLE| -> Result<HWND> {
        let child=CreateWindowExW(WINDOW_EX_STYLE(0),class,PCWSTR(wide(label).as_ptr()),WS_CHILD|WS_VISIBLE|style,0,0,0,0,Some(hwnd),Some(HMENU(id as *mut _)),Some(instance.into()),None)?;
        Ok(child)
    };
    view.children=vec![
        control(w!("STATIC"),"WANGAI   /   PORTABLE",10,WINDOW_STYLE(0))?,
        control(w!("STATIC"),"พร้อมใช้ในโฟลเดอร์ของคุณ — ไม่ต้องติดตั้ง",11,WINDOW_STYLE(0))?,
        control(w!("STATIC"),"&ตำแหน่งโฟลเดอร์ WANGAI",12,WINDOW_STYLE(0))?,
        control(w!("EDIT"),&view.root.to_string_lossy(),13,WS_TABSTOP|WS_BORDER|WINDOW_STYLE(ES_AUTOHSCROLL as u32))?,
        control(w!("BUTTON"),"เปลี่ยน&โฟลเดอร์…",14,WS_TABSTOP|WINDOW_STYLE(BS_OWNERDRAW as u32))?,
        control(w!("BUTTON"),"นำการตั้งค่าเดิมมาใช้ (&I) · ไม่แก้หรือลบต้นฉบับ",15,WS_TABSTOP|WINDOW_STYLE(BS_AUTOCHECKBOX as u32))?,
        control(w!("STATIC"),"ไม่เลือกนำเข้า = เริ่มใหม่ · ถ้า Portable มีข้อมูลแล้ว จะใช้ข้อมูลนั้นเสมอ",16,WINDOW_STYLE(0))?,
        control(w!("STATIC"),"ครั้งถัดไปเปิด WANGAI.exe ในโฟลเดอร์นี้ · ย้ายทั้งโฟลเดอร์พร้อม Data",17,WINDOW_STYLE(0))?,
        control(PROGRESS_CLASSW,"",18,WINDOW_STYLE(0))?,
        control(w!("BUTTON"),"เตรียมและเปิด WANGAI (&S)",19,WS_TABSTOP|WINDOW_STYLE(BS_OWNERDRAW as u32))?,
        control(w!("BUTTON"),"ยกเลิก (&C)",20,WS_TABSTOP|WINDOW_STYLE(BS_OWNERDRAW as u32))?,
    ];
    // Native themed checkboxes otherwise draw black text over the dark background.
    let _=SetWindowTheme(view.children[5],w!(""),w!(""));
    let _=SetWindowTheme(view.children[8],w!(""),w!(""));
    SendMessageW(view.children[8],PBM_SETRANGE32,WPARAM(0),LPARAM(100));
    SendMessageW(view.children[8],PBM_SETBKCOLOR,WPARAM(0),LPARAM(0x0033302a));
    SendMessageW(view.children[8],PBM_SETBARCOLOR,WPARAM(0),LPARAM(GREEN.0 as isize));
    layout(hwnd,&mut view);
    if !matches!(view.task,Task::Prepare(_)) {
        for index in 2..7 { let _=ShowWindow(view.children[index],SW_HIDE); }
        start(hwnd,&mut view);
    } else if crate::host::legacy_settings().is_none() { let _=EnableWindow(view.children[5],false); }
    let _=ShowWindow(hwnd,SW_SHOW); let _=UpdateWindow(hwnd);
    let _=SetFocus(Some(view.children[9]));
    SetTimer(Some(hwnd),1,100,None);
    let mut message=MSG::default();
    while GetMessageW(&mut message,None,0,0).as_bool() {
        if !IsDialogMessageW(hwnd,&message).as_bool() { let _=TranslateMessage(&message); DispatchMessageW(&message); }
    }
    let _=DeleteObject(view.font.into());let _=DeleteObject(view.heading.into()); let _=DeleteObject(view.brush.into()); CoUninitialize();
    Ok(())
} }
unsafe fn layout(hwnd:HWND,view:&mut View) {
    let scale=|n:i32| n*view.dpi as i32/96;
    if !view.font.is_invalid() { let _=DeleteObject(view.font.into()); }
    if !view.heading.is_invalid() {let _=DeleteObject(view.heading.into());}
    view.font=CreateFontW(-scale(17),0,0,0,400,0,0,0,DEFAULT_CHARSET,OUT_DEFAULT_PRECIS,CLIP_DEFAULT_PRECIS,DEFAULT_QUALITY,DEFAULT_PITCH.0 as u32,w!("Segoe UI"));
    view.heading=CreateFontW(-scale(28),0,0,0,700,0,0,0,DEFAULT_CHARSET,OUT_DEFAULT_PRECIS,CLIP_DEFAULT_PRECIS,DEFAULT_QUALITY,DEFAULT_PITCH.0 as u32,w!("Segoe UI"));
    let positions=[(30,25,660,35),(30,67,660,30),(30,118,660,28),(30,149,490,36),(535,149,160,36),(30,206,660,30),(30,243,660,35),(30,287,665,61),(30,355,665,15),(30,395,465,42),(515,395,180,42)];
    for (child,(x,y,w,h)) in view.children.iter().zip(positions) {
        SendMessageW(*child,WM_SETFONT,WPARAM(view.font.0 as usize),LPARAM(1));
        let _=MoveWindow(*child,scale(x),scale(y),scale(w),scale(h),true);
    }
    SendMessageW(view.children[0],WM_SETFONT,WPARAM(view.heading.0 as usize),LPARAM(1));
    let _=InvalidateRect(Some(hwnd),None,true);
}
unsafe fn start(hwnd:HWND,view:&mut View) {
    if view.busy { return; }
    let mut text=vec![0u16;32768]; let len=GetWindowTextW(view.children[3],&mut text);
    view.root=PathBuf::from(String::from_utf16_lossy(&text[..len as usize]));
    let import=SendMessageW(view.children[5],BM_GETCHECK,WPARAM(0),LPARAM(0)).0==BST_CHECKED.0 as isize;
    view.busy=true; view.cancel.store(false,Ordering::Relaxed);
    view.cancellable=matches!(view.task,Task::Prepare(_));
    for index in [3,4,5,9] { let _=EnableWindow(view.children[index],false); }
    let _=EnableWindow(view.children[10],view.cancellable);
    let (sender,receiver)=mpsc::channel(); view.receiver=Some(receiver);
    let report:Reporter=Arc::new(move|progress| {let _=sender.send(progress);});
    let task=view.task.clone();let root=view.root.clone();let cancel=view.cancel.clone();
    thread::spawn(move || {
        let result=std::panic::catch_unwind(std::panic::AssertUnwindSafe(||crate::host::work(task,root,import,cancel,report.clone())));
        let message=match result { Ok(Ok(()))=>None,Ok(Err(e))=>Some(format!("{e:#}")),Err(_)=>Some("งานเตรียมไฟล์หยุดทำงาน กรุณาเปิด WANGAI.exe เพื่อกู้คืน ข้อมูล Data ไม่ถูกลบ".into()) };
        report(Progress::Done(message));
    });
    let _=InvalidateRect(Some(hwnd),None,true);
}
unsafe extern "system" fn procedure(hwnd:HWND,message:u32,wparam:WPARAM,lparam:LPARAM) -> LRESULT {
    let ptr=GetWindowLongPtrW(hwnd,GWLP_USERDATA) as *mut View;
    if ptr.is_null() { return DefWindowProcW(hwnd,message,wparam,lparam); }
    let view=&mut *ptr;
    match message {
        WM_COMMAND=>match wparam.0 & 0xffff {
            1|19=>start(hwnd,view), // IsDialogMessage maps Return to IDOK.
            2|20=>{if view.busy { if view.cancellable { view.cancel.store(true,Ordering::Relaxed); } } else { let _=DestroyWindow(hwnd); }}, // Escape -> IDCANCEL.
            14=>{ if let Ok(folder)=choose_folder(hwnd) { let _=SetWindowTextW(view.children[3],PCWSTR(wide(folder).as_ptr())); } },
            _=>{}
        },
        WM_TIMER=>{
            let events:Vec<_>=view.receiver.as_ref().map(|r|r.try_iter().collect()).unwrap_or_default();
            for event in events {
                match event {
                    Progress::Status(text,percent,cancellable)=>{
                        view.cancellable=cancellable;
                        let _=SetWindowTextW(view.children[7],PCWSTR(wide(text).as_ptr()));
                        SendMessageW(view.children[8],PBM_SETPOS,WPARAM(percent as usize),LPARAM(0));
                        let _=EnableWindow(view.children[10],cancellable);
                    }
                    Progress::Done(None)=>{view.busy=false;let _=DestroyWindow(hwnd);},
                    Progress::Done(Some(error))=>{
                        view.busy=false;view.receiver=None;
                        #[cfg(feature="release-test")]
                        if wangai_portable::read_json::<serde_json::Value>(&view.root.join("Data/test-control.json")).ok().is_some_and(|v|v["_headless"]==true) {
                            let _=wangai_portable::atomic_json(&view.root.join("Data/portable-test-error.json"),&serde_json::json!({"error":error}));
                            let _=DestroyWindow(hwnd);continue;
                        }
                        let _=SetWindowTextW(view.children[7],w!("ยังไม่สำเร็จ — ดูข้อความผิดพลาดแล้วลองใหม่ หรือปิดหน้าต่างนี้"));
                        for index in [3,4,5,9,10] { let _=EnableWindow(view.children[index],true); }
                        error_owned(Some(hwnd),&error);
                    }
                }
            }
        }
        WM_CLOSE=>{ if view.busy { if view.cancellable {view.cancel.store(true,Ordering::Relaxed);} } else {let _=DestroyWindow(hwnd);} },
        WM_DESTROY=>PostQuitMessage(0),
        WM_CTLCOLORSTATIC|WM_CTLCOLOREDIT|WM_CTLCOLORBTN=>{
            let dc=HDC(wparam.0 as *mut _);let id=GetDlgCtrlID(HWND(lparam.0 as *mut _));
            SetTextColor(dc,if id==10 {GREEN} else {COLORREF(0x00dfdfdf)});SetBkColor(dc,BG);return LRESULT(view.brush.0 as isize);
        }
        WM_DRAWITEM=>{
            let item=&*(lparam.0 as *const DRAWITEMSTRUCT);
            let saved=SaveDC(item.hDC);
            let green=item.CtlID==19 && item.itemState.0 & ODS_DISABLED.0==0;
            let brush=CreateSolidBrush(if green {GREEN} else {COLORREF(0x0033302a)});
            FillRect(item.hDC,&item.rcItem,brush);let _=DeleteObject(brush.into());
            SetBkMode(item.hDC,TRANSPARENT);SetTextColor(item.hDC,if green {BG} else {GREEN});
            SelectObject(item.hDC,view.font.into());
            let mut text=vec![0u16;256];let len=GetWindowTextW(item.hwndItem,&mut text);let mut rect=item.rcItem;
            DrawTextW(item.hDC,&mut text[..len as usize],&mut rect,DT_CENTER|DT_VCENTER|DT_SINGLELINE);
            if item.itemState.0 & ODS_FOCUS.0!=0 { let _=DrawFocusRect(item.hDC,&item.rcItem); }
            let _=RestoreDC(item.hDC,saved);
            return LRESULT(1);
        }
        WM_DPICHANGED=>{
            view.dpi=(wparam.0 & 0xffff) as u32;let rect=&*(lparam.0 as *const RECT);
            let _=SetWindowPos(hwnd,None,rect.left,rect.top,rect.right-rect.left,rect.bottom-rect.top,SWP_NOZORDER|SWP_NOACTIVATE);layout(hwnd,view);
        }
        _=>return DefWindowProcW(hwnd,message,wparam,lparam)
    }
    LRESULT(0)
}
unsafe fn choose_folder(owner:HWND) -> Result<PathBuf> {
    let picker:IFileOpenDialog=CoCreateInstance(&FileOpenDialog,None,CLSCTX_INPROC_SERVER)?;
    picker.SetOptions(FOS_PICKFOLDERS|FOS_FORCEFILESYSTEM|FOS_PATHMUSTEXIST)?;
    picker.SetTitle(w!("เลือกโฟลเดอร์ WANGAI ที่ว่าง หรือโฟลเดอร์ Portable เดิม"))?;
    picker.Show(Some(owner))?;
    let value=picker.GetResult()?.GetDisplayName(SIGDN_FILESYSPATH)?;
    let result=PathBuf::from(value.to_string()?);CoTaskMemFree(Some(value.0 as _));Ok(result)
}
