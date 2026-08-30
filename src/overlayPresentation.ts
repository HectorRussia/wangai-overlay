import type { SubtitleItem } from "./types";

export type OverlayPresentation = "collapsed" | "expanded";

export interface OverlayPresentationState {
  hasPartial: boolean;
  visibleItems: number;
  microphoneActive: boolean;
  editMode: boolean;
}

export function overlayPresentation(state: OverlayPresentationState): OverlayPresentation {
  return state.hasPartial || state.visibleItems > 0 || state.microphoneActive || state.editMode
    ? "expanded"
    : "collapsed";
}

export function visibleOverlayItems(
  history: SubtitleItem[],
  maxItems: number,
  fadeSeconds: number,
  nowMs: number,
): SubtitleItem[] {
  const latest = history.slice(0, Math.max(1, maxItems));
  const newest = latest[0];
  if (!newest || nowMs - newest.createdAtMs >= fadeSeconds * 1000) return [];
  return latest.reverse();
}
