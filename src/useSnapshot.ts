import { useCallback, useEffect, useState } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { api } from "./api";
import { isPreviewMode, previewSnapshot } from "./preview";
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

  const refresh = useCallback(async () => {
    if (preview) return;
    try {
      setSnapshot(await api.snapshot());
      setLoadingError(undefined);
    } catch (error) {
      setLoadingError(errorText(error));
    }
  }, [preview]);

  useEffect(() => {
    if (preview) return;
    void refresh();
    const cleanup: UnlistenFn[] = [];
    let cancelled = false;
    const add = async <T,>(name: string, handler: (payload: T) => void) => {
      const unlisten = await listen<T>(name, (event) => handler(event.payload));
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
    ]).catch((error) => setLoadingError(errorText(error)));

    return () => {
      cancelled = true;
      cleanup.forEach((unlisten) => unlisten());
    };
  }, [preview, refresh]);

  return { snapshot, setSnapshot, refresh, loadingError };
}
