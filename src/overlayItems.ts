import type { SubtitleItem } from "./types";

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
