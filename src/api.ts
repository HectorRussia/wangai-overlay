import type { AppApi } from "./transport/contract";
import { desktopApi } from "./transport/desktopApi";
import { webApi } from "./transport/webApi";
import { tauriRuntime, previewRuntime } from "./transport/runtime";

export type { AppApi, WebCompanionInfo } from "./transport/contract";
export { isDesktopRuntime, isWebCompanion } from "./transport/runtime";
export { connectWebSnapshot } from "./transport/webSnapshots";

// Preview keeps the existing visual-only navigation override. It is not an engine.
export const api: AppApi = tauriRuntime ? desktopApi : previewRuntime ? {
  ...webApi,
  openSettingsWindow: () => {
    window.location.hash = "#/settings/advanced";
    return Promise.resolve();
  },
} : webApi;
