"use client";

import { useRef } from "react";
import { X } from "lucide-react";

export function LoginButton() {
  const dialog = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        className="login-button"
        onClick={() => dialog.current?.showModal()}
      >
        เข้าสู่ระบบ
      </button>
      <dialog
        ref={dialog}
        className="login-dialog"
        aria-labelledby="login-dialog-title"
        aria-describedby="login-dialog-copy login-note"
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
          )
            dialog.current?.close();
        }}
      >
        <button
          className="login-close"
          aria-label="ปิดหน้าต่างเข้าสู่ระบบ"
          onClick={() => dialog.current?.close()}
        >
          <X size={20} aria-hidden="true" />
        </button>
        <p className="login-eyebrow">WANGAI ACCOUNT</p>
        <h2 id="login-dialog-title" className="login-dialog-title">
          เข้าสู่ระบบ ว่าไง
        </h2>
        <p id="login-dialog-copy" className="login-dialog-copy">
          เข้าใช้งานด้วยบัญชี Google ของคุณ
        </p>
        <button type="button" disabled className="google-login-button">
          <span aria-hidden="true" className="google-mark">
            G
          </span>
          เข้าสู่ระบบด้วย Google
        </button>
        <p id="login-note" className="login-note">
          ระบบบัญชีผู้ใช้จะเปิดให้ใช้งานเร็ว ๆ นี้
        </p>
      </dialog>
    </>
  );
}
