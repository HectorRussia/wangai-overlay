import { useEffect, useState } from "react";
import { previewListeningBusy, previewNotification } from "../preview";
import { errorText } from "./errors";

export type Toast = { kind: "ok" | "error"; text: string };

export function useCommandTask(
  refresh: () => Promise<void>,
  successTimeout?: number,
) {
  const [busy, setBusy] = useState<string | undefined>(() =>
    previewListeningBusy() ? "listen" : undefined,
  );
  const [toast, setToast] = useState<Toast | undefined>(previewNotification);
  useEffect(() => {
    if (toast?.kind !== "ok" || successTimeout === undefined) return;
    const timeout = window.setTimeout(
      () => setToast((current) => (current === toast ? undefined : current)),
      successTimeout,
    );
    return () => window.clearTimeout(timeout);
  }, [toast, successTimeout]);
  const run = async (key: string, task: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    setToast(undefined);
    try {
      await task();
      await refresh();
      setToast({ kind: "ok", text: ok });
    } catch (error) {
      setToast({ kind: "error", text: errorText(error) });
    } finally {
      setBusy(undefined);
    }
  };
  return { busy, toast, setToast, run };
}
