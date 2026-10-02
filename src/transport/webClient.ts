import { isWebCompanion } from "./runtime";

const initialBootstrapToken =
  typeof window !== "undefined"
    ? window.location.hash.match(/^#wangai-token=([A-Za-z0-9_-]+)$/)?.[1]
    : undefined;

if (initialBootstrapToken && typeof window !== "undefined") {
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${window.location.search}#/settings/overview`,
  );
}

let sessionPromise: Promise<void> | undefined;

export async function ensureWebSession(): Promise<void> {
  if (!isWebCompanion()) return;
  sessionPromise ??= (async () => {
    if (!initialBootstrapToken) return;
    const response = await fetch("/api/v1/session", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: initialBootstrapToken }),
    });
    if (!response.ok)
      throw new Error(
        "Web Companion session ไม่ถูกต้อง กรุณาเปิดใหม่จาก Desktop",
      );
  })();
  return sessionPromise;
}

export async function webJson<T>(path: string, init?: RequestInit): Promise<T> {
  await ensureWebSession();
  const response = await fetch(path, { ...init, credentials: "same-origin" });
  const payload = (await response.json().catch(() => undefined)) as
    | { error?: string }
    | undefined;
  if (!response.ok) {
    throw new Error(
      payload?.error ??
        (response.status === 401
          ? "Desktop session ขาดการเชื่อมต่อ กรุณาเปิด Web App ใหม่จาก WANGAI"
          : `Web Companion ตอบ ${response.status}`),
    );
  }
  return payload as T;
}

type WebCommandArgs = Record<string, unknown> | undefined;

export function webCommand<T>(
  command: string,
  args?: WebCommandArgs,
): Promise<T> {
  return webJson<T>("/api/v1/command", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(args ? { command, args } : { command }),
  });
}
