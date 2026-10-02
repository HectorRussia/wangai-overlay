export const tauriRuntime = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
export const previewRuntime = typeof window !== "undefined"
  && new URLSearchParams(window.location.search).has("preview");
export const isDesktopRuntime = () => tauriRuntime;
export const isWebCompanion = () => !tauriRuntime && !previewRuntime;

