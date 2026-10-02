"use client";

import { useRef } from "react";

export function MobileMenu() {
  const menu = useRef<HTMLDetailsElement>(null);
  return (
    <details
      className="mobile-menu"
      ref={menu}
      onKeyDown={(event) => {
        if (event.key === "Escape" && menu.current?.open) {
          menu.current.open = false;
          menu.current.querySelector("summary")?.focus();
        }
      }}
    >
      <summary>เมนู</summary>
      <nav
        aria-label="เมนูมือถือ"
        onClick={() => {
          if (menu.current) menu.current.open = false;
        }}
      >
        <a href="#features">ทำอะไรได้บ้าง</a>
        <a href="#how-it-works">เริ่มใช้งาน</a>
        <a href="#faq">คำถามที่พบบ่อย</a>
      </nav>
    </details>
  );
}
