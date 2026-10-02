import type { AppSnapshot } from "../types";
import { ensureWebSession, webJson } from "./webClient";

export async function connectWebSnapshot(
  onSnapshot: (snapshot: AppSnapshot) => void,
  onDisconnected: (message: string) => void,
): Promise<() => void> {
  await ensureWebSession();
  let closed = false;
  let socket: WebSocket | undefined;
  let polling: number | undefined;
  let reconnect: number | undefined;
  let attempts = 0;

  const poll = async () => {
    if (closed) return;
    try {
      onSnapshot(await webJson<AppSnapshot>("/api/v1/snapshot"));
    } catch {
      onDisconnected("Desktop ปิดอยู่หรือ Web Companion ขาดการเชื่อมต่อ");
    }
  };
  const connect = () => {
    if (closed) return;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    socket = new WebSocket(`${protocol}//${window.location.host}/api/v1/events`);
    socket.onopen = () => {
      attempts = 0;
      if (polling !== undefined) window.clearInterval(polling);
      polling = undefined;
    };
    socket.onmessage = (event) => {
      try { onSnapshot(JSON.parse(String(event.data)) as AppSnapshot); } catch { /* ignore malformed state */ }
    };
    socket.onclose = () => {
      if (closed) return;
      onDisconnected("กำลังเชื่อมต่อ Desktop ใหม่…");
      if (polling === undefined) polling = window.setInterval(() => void poll(), 2_000);
      attempts += 1;
      reconnect = window.setTimeout(connect, Math.min(10_000, 500 * 2 ** attempts));
    };
  };
  connect();
  return () => {
    closed = true;
    socket?.close();
    if (polling !== undefined) window.clearInterval(polling);
    if (reconnect !== undefined) window.clearTimeout(reconnect);
  };
}
