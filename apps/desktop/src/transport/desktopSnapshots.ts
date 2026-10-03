import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { SnapshotEvent, SnapshotPayloads } from "../state/snapshotReducer";

// Return cancellation immediately, including while native registrations are pending.
export function connectDesktopSnapshot(
  onEvent: (event: SnapshotEvent) => void,
  onError: (error: unknown) => void,
): () => void {
  const cleanup: UnlistenFn[] = [];
  let cancelled = false;
  const add = async <K extends keyof SnapshotPayloads>(type: K) => {
    const stop = await listen<SnapshotPayloads[K]>(type, (event) => {
      if (!cancelled)
        onEvent({ type, payload: event.payload } as SnapshotEvent);
    });
    if (cancelled) stop();
    else cleanup.push(stop);
  };
  void Promise.all([
    add("runtime-state"),
    add("settings-updated"),
    add("worker-status"),
    add("pipeline-status"),
    add("pipeline-error"),
    add("transcript"),
    add("subtitle-item"),
    add("translation-result"),
  ]).catch((error) => {
    if (!cancelled) onError(error);
  });
  return () => {
    cancelled = true;
    cleanup.splice(0).forEach((stop) => stop());
  };
}
