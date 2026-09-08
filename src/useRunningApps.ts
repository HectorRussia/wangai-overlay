import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { isPreviewMode, previewRunningApps } from "./preview";
import type { RunningApp } from "./types";

export function useRunningApps(open: boolean) {
  const [apps, setApps] = useState<RunningApp[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const generation = useRef(0);
  const pending = useRef<number | undefined>(undefined);
  const refresh = useCallback(async () => {
    const current = generation.current;
    if (pending.current === current) return;
    pending.current = current;
    setLoading(true);
    try {
      const result = isPreviewMode() ? previewRunningApps : await api.listRunningApps();
      if (generation.current === current) { setApps(result); setError(undefined); }
    } catch (error) {
      if (generation.current === current) setError(error instanceof Error ? error.message : String(error));
    } finally {
      if (pending.current === current) pending.current = undefined;
      if (generation.current === current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (!open) return;
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => { generation.current += 1; window.clearInterval(timer); };
  }, [open, refresh]);
  return { apps, loading, error, refresh };
}
