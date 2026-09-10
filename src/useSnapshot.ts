import { useCallback, useEffect, useRef, useState } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { api, connectWebSnapshot, isWebCompanion } from "./api";
import { isPreviewMode, previewSnapshot } from "./preview";
import { loadSnapshot } from "./snapshotBootstrap";
import type {
  AppSettings,
  AppSnapshot,
  RuntimeState,
  SubtitleItem,
  TranscriptEvent,
  TranslationResult,
  WorkerStatusEvent,
} from "./types";

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useSnapshot() {
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
    const cleanup: UnlistenFn[] = [];
    let cancelled = false;
    const add = async <T,>(name: string, handler: (payload: T) => void) => {
      const unlisten = await listen<T>(name, (event) => { if (!cancelled) handler(event.payload); });
      if (cancelled) unlisten();
      else cleanup.push(unlisten);
    };
    void Promise.all([
      add<RuntimeState>("runtime-state", (runtime) =>
        setSnapshot((value) => (value ? { ...value, runtime } : value)),
      ),
      add<AppSettings>("settings-updated", (settings) =>
        setSnapshot((value) => (value ? { ...value, settings } : value)),
      ),
      add<WorkerStatusEvent>("worker-status", (status) =>
        setSnapshot((value) =>
          value
            ? {
                ...value,
                runtime: {
                  ...value.runtime,
                  workerReady: status.state === "ready",
                  workerModel: status.model ?? value.runtime.workerModel,
                  statusMessage: status.message,
                },
              }
            : value,
        ),
      ),
      add<string>("pipeline-status", (statusMessage) =>
        setSnapshot((value) =>
          value ? { ...value, runtime: { ...value.runtime, statusMessage } } : value,
        ),
      ),
      add<string>("pipeline-error", (lastError) =>
        setSnapshot((value) =>
          value ? { ...value, runtime: { ...value.runtime, lastError } } : value,
        ),
      ),
      add<TranscriptEvent>("transcript", (transcript) =>
        setSnapshot((value) =>
          value ? { ...value, partial: transcript.kind === "partial" ? transcript : undefined } : value,
        ),
      ),
      add<SubtitleItem>("subtitle-item", (item) =>
        setSnapshot((value) =>
          value
            ? {
                ...value,
                history: [item, ...value.history.filter((old) => old.segmentId !== item.segmentId)].slice(0, 100),
              }
            : value,
        ),
      ),
      add<TranslationResult>("translation-result", (result) =>
        setSnapshot((value) =>
          value
            ? {
                ...value,
                history: value.history.map((item) =>
                  item.segmentId === result.segmentId
                    ? { ...item, translatedText: result.translatedText, status: result.status }
                    : item,
                ),
              }
            : value,
        ),
      ),
    ]).catch((error) => { if (!cancelled) setLoadingError(errorText(error)); });

    return () => {
      cancelled = true;
      cancelRequest();
      cleanup.forEach((unlisten) => unlisten());
    };
  }, [preview, refresh]);

  return { snapshot, setSnapshot, refresh, loadingError };
}
