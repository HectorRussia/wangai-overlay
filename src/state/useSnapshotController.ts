import { useCallback, useEffect, useRef, useState } from "react";
import { api, connectWebSnapshot, isWebCompanion } from "../api";
import { isPreviewMode, previewSnapshot } from "../preview";
import { loadSnapshot } from "./snapshotBootstrap";
import type { AppSnapshot } from "../types";
import { errorText } from "../shared/errors";
import { connectDesktopSnapshot } from "../transport/desktopSnapshots";
import { reduceSnapshot } from "./snapshotReducer";

export function useSnapshotController() {
  const preview = isPreviewMode();
  const [snapshot, setSnapshot] = useState<AppSnapshot | undefined>(() =>
    preview ? previewSnapshot() : undefined,
  );
  const [loadingError, setLoadingError] = useState<string>();
  const mounted = useRef(false);
  const activeRequest = useRef<AbortController | undefined>(undefined);

  const refresh = useCallback(async () => {
    if (preview) return;
    activeRequest.current?.abort();
    const request = new AbortController();
    activeRequest.current = request;
    setLoadingError(undefined);
    try {
      // Web Companion already has its own websocket/polling reconnect loop.
      const next = await loadSnapshot(api.snapshot, request.signal, isWebCompanion() ? 1 : 5);
      if (mounted.current && !request.signal.aborted) {
        setSnapshot(next);
        setLoadingError(undefined);
      }
    } catch (error) {
      if (mounted.current && !request.signal.aborted) setLoadingError(errorText(error));
    } finally {
      if (activeRequest.current === request) activeRequest.current = undefined;
    }
  }, [preview]);

  useEffect(() => {
    if (preview) return;
    mounted.current = true;
    const cancelRequest = () => {
      mounted.current = false;
      activeRequest.current?.abort();
      activeRequest.current = undefined;
    };
    void refresh();
    if (isWebCompanion()) {
      let cleanup: (() => void) | undefined;
      let cancelled = false;
      void connectWebSnapshot(
        (next) => {
          if (cancelled) return;
          activeRequest.current?.abort();
          setSnapshot(next);
          setLoadingError(undefined);
        },
        message => { if (!cancelled) setLoadingError(message); },
      ).then((stop) => {
        if (cancelled) stop();
        else cleanup = stop;
      }).catch((error) => { if (!cancelled) setLoadingError(errorText(error)); });
      return () => {
        cancelled = true;
        cancelRequest();
        cleanup?.();
      };
    }
    const stop = connectDesktopSnapshot(
      event => setSnapshot(value => reduceSnapshot(value, event)),
      error => setLoadingError(errorText(error)),
    );
    return () => {
      cancelRequest();
      stop();
    };
  }, [preview, refresh]);

  return { snapshot, setSnapshot, refresh, loadingError };
}
