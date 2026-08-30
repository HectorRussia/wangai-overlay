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
