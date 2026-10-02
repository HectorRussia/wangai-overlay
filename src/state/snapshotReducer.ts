import type {
  AppSettings, AppSnapshot, RuntimeState, SubtitleItem, TranscriptEvent,
  TranslationResult, WorkerStatusEvent,
} from "../types";

export interface SnapshotPayloads {
  "runtime-state": RuntimeState;
  "settings-updated": AppSettings;
  "worker-status": WorkerStatusEvent;
  "pipeline-status": string;
  "pipeline-error": string;
  "transcript": TranscriptEvent;
  "subtitle-item": SubtitleItem;
  "translation-result": TranslationResult;
}

export type SnapshotEvent = {
  [K in keyof SnapshotPayloads]: { type: K; payload: SnapshotPayloads[K] }
}[keyof SnapshotPayloads];

export function reduceSnapshot(value: AppSnapshot | undefined, event: SnapshotEvent): AppSnapshot | undefined {
  if (!value) return value;
  switch (event.type) {
    case "runtime-state": return { ...value, runtime: event.payload };
    case "settings-updated": return { ...value, settings: event.payload };
    case "worker-status": return {
      ...value,
      runtime: {
        ...value.runtime,
        workerReady: event.payload.state === "ready",
        workerModel: event.payload.model ?? value.runtime.workerModel,
        statusMessage: event.payload.message,
      },
    };
    case "pipeline-status": return { ...value, runtime: { ...value.runtime, statusMessage: event.payload } };
    case "pipeline-error": return { ...value, runtime: { ...value.runtime, lastError: event.payload } };
    case "transcript": return { ...value, partial: event.payload.kind === "partial" ? event.payload : undefined };
    case "subtitle-item": return {
      ...value,
      history: [event.payload, ...value.history.filter(old => old.segmentId !== event.payload.segmentId)].slice(0, 100),
    };
    case "translation-result": return {
      ...value,
      history: value.history.map(item => item.segmentId === event.payload.segmentId
        ? { ...item, translatedText: event.payload.translatedText, status: event.payload.status }
        : item),
    };
  }
}
