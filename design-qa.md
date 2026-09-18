# WANGAI 0.4.0 — visual implementation QA

Date: 2026-09-18. Scope: browser-rendered Quiet Studio / CSS fallback.

The previous Ready Room QA report is preserved unchanged in
`docs/design-qa-ready-room-original.md`.

## Target and comparison

User selected the revised iPhone-inspired **desktop** Quiet Studio image. Reference:
`output/liquid-glass-qa/selected-reference.png` (original 1487 × 1058).
Implementation: `http://127.0.0.1:1420/?preview=1&state=studio#/settings/overview`.
Comparison uses 1487 × 1013 content pixels, excluding the 45px reference native
titlebar, the same dark/listening/MIXED state and the same Thai/English phrase.
`output/liquid-glass-qa/comparison.html` places both images together; screenshots
`comparison-before.png` and `comparison-final.png` were actually inspected.

The reference's floating Overlay is a **separate native window**, not a second
copy embedded in Settings. It is therefore validated independently at 420 × 236.
Windows chrome is deliberately not recreated in HTML. Local Thai fonts and Lucide
replace the generated image's letterforms/icons; no external font/CDN is used.

## Iteration log

1. **Blocked, P2:** heading/nav typography too small; silver surfaces too flat.
   Increased large-window type scale/nav targets, added static silver rim and
   subtle surface shading. Kept matte text area and no continuous animation.
2. **Blocked, P2:** legacy Settings padding remained at narrow widths; meter bars
   became oversized circles. Removed inherited shell padding and bounded bars.
3. **Blocked, P2:** native-size Overlay retained tiny old subtitle typography.
   Increased both languages; a single phrase uses larger, bounded two-line text.
4. **Pass for browser UI handoff:** revised target/render side-by-side comparison,
   responsive view and Overlay were re-captured. No remaining P0/P1/P2 issue was
   observed in the tested browser states. This is not a native release gate pass.

## Inspected states and interaction evidence

- Ready Room: selected source, start/stop, pending, silence, offline, worker error,
  setup/empty and long unbroken text. Start/stop and source selection were clicked
  against the in-memory fixture, never real audio/AI.
- Sidebar: history/settings links, active page, collapse, icon-only accessible names.
- Audio, AI & Terms and Controls & Overlay: navigation, mode selection, adding and
  saving Thai glossary text in the fixture; update verification state.
- Source picker: search, select, initial search focus, Shift+Tab, Escape and focus
  restoration. Tested again with the experimental library mounted.
- 1487 × 1013, 980 × 660 and 740 × 507 CSS-pixel viewports. The latter is a
  high-scale-equivalent layout check, **not** a Windows DPI 200% certification.
  Long text/error did not overflow horizontally (document width 725, viewport 740,
  remaining width is the vertical scrollbar).
- Experimental `?preview=1&glass=liquid` mounts the pinned library and preserves
  controls. No browser warning/error was recorded during that interaction test.
  CSS fallback remains the shipping default pending the native performance gate.
- Automated tests cover reduced motion/forced colors/hidden enhancement unmount,
  startup acknowledgement without AI connectivity, keyboard-accessible bootstrap
  recovery and existing command/navigation contracts.

## P3 differences / explicit limits

- Surface highlights are static CSS, not the mockup's raster/refraction lighting.
- History link is beside its section heading; the privacy explanation remains
  available in the footer. Both preserve useful existing behavior.
- Real Windows titlebar, 100–200% system DPI, high-contrast theme, F7–F10, native
  drag/lock/click-through, exact-artifact GPU/CPU/frame-time and live Web Companion
  still require native acceptance. Browser evidence does not certify these.
- The full production release status and actual native upgrade/rollback results
  are recorded separately in `docs/liquid-glass-verification.md`.
