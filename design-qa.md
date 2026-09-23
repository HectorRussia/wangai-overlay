# WANGAI 0.4.0 — visual implementation QA

Date: 2026-09-18. Scope: browser-rendered Quiet Studio / CSS fallback.

Latest local revision: compact typography and complete, scrollable Overlay text.
The user's reported screenshot and request to reduce scale supersede the earlier
large-type mock. See **Compact typography follow-up** below; the original design
comparison is retained as history, not the target for this adjustment.

final result: passed

This result applies only to the browser UI handoff described below, not the
uncompleted native acceptance or Stable release gates.

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

## Compact typography follow-up — 2026-09-18

final result: passed

Scope: frontend/browser visual and interaction regression only. The existing
signed Preview from commit 343a840 does **not** include this working-tree change.

### Sources, normalization and evidence

- User report: `C:/Users/User/AppData/Local/Temp/codex-clipboard-d3c39d33-1308-406b-b9ef-6490fdcdbc03.png`.
  Preserved copy: `output/compact-ui-qa/reported-ui.png` (1911 × 1025).
- Implementation: `http://127.0.0.1:1422/?preview=1&state=transcript-wrap&ui=success#/settings/overview`.
  `output/compact-ui-qa/ready-room-1911.png` is a 1911 × 1001 browser capture.
  Original native titlebar cropped by 24px; native Windows chrome is not recreated.
- Same reported Thai/English latest sentence and four incoming MIXED phrases are
  represented by a safe fixture. Live capture/AI status and Desktop-only quit
  controls are not identical to the supplied screenshot and are not fidelity claims.
- Combined full-view and focused-region comparison was actually opened and
  inspected: `output/compact-ui-qa/comparison.html` and `comparison-final.png`.
  Main panels share scale; focused original Overlay crop is about 735 × 401 and
  revised native-size content capture is 740 × 400 at 100% font preference.
- Additional captures: `overlay-420.png`, `overlay-420-history.png`,
  `overlay-340-large-font-final.png`, `overlay-unbroken-340.png`,
  `font-control-980.png`, `ready-room-980.png`, `ready-room-740.png`,
  `ready-room-390.png`, all under `output/compact-ui-qa/`.
  These are CSS viewport checks, not a physical Windows DPI certification.

### Findings and iteration history

1. **P1 fixed — excessive desktop scale.** The large-window rule forced heading
   62px, latest translation 59px, original 40px and primary button height 76px.
   Removed the scale-up breakpoint. Verified 34px heading, 26px translation,
   18px original and 46px primary button at full desktop width. Sidebar text,
   source icon, spacing and other headings are reduced consistently.
2. **P1 fixed — clipped complete sentences.** Multiple Overlay items inherited
   `nowrap`/ellipsis; a single item instead jumped to 25px and a two-line clamp.
   All complete/partial text now wraps, including Thai and unbroken Latin text,
   with 16px/13px base sizes and the existing saved font multiplier. No forced
   single-item enlargement or line clamp remains.
3. **P1 fixed — inaccessible overflow.** Bottom justification on the scrollport
   itself put older content outside its reachable range. A separate scrollable
   region now retains the full text below the fixed titlebar. Recent text is
   followed, but editing-mode readers are not pulled away from older text.
   Taller-than-window latest messages start at their first line; F7 unlocks
   scrolling using the existing edit mode. The hint respects a customized key.
4. **P2 found during first stress pass — animation-dependent scroll alignment.**
   Bounding rectangles during entry animation caused a few pixels of overscroll.
   Switched to stable layout offsets, then re-captured the 340 × 190, 180%-font
   case. Latest item starts at the scrollport boundary (fractional-pixel rounding
   only); first text line is below the titlebar. No horizontal overflow observed.

### Required surfaces and interaction checks

- Typography: existing local fonts preserved; Thai/English hierarchy reduced,
  explicit multiline wrapping, no missing transcript suffixes. Long messages
  exceeding viewport height require scrolling, not invisible truncation.
- Spacing/layout: original sidebar/control-strip hierarchy retained, compact
  targets remain usable. At 980 × 700, 740 × 507 and 390 × 844, no horizontal
  document overflow; narrower pages scroll vertically.
- Colors/tokens: existing graphite/silver/green and semantic status colors retained.
- Assets/icons: existing WANGAI text brand and Lucide icons retained; no new image
  assets, font/CDN dependencies, illustrative substitutes or external scripts.
- Copy/content: same latest sentence as report; added actionable overflow hint
  and a labeled font-size slider. Existing source labels and hotkeys retained.
- Default 420 × 236 Overlay: primary Thai wraps to two lines, latest original and
  translation both fit; Ctrl+Home reaches the first retained phrase at scrollTop 0
  below the header. Older rows may be partially visible at a scroll boundary,
  but are fully reachable by scrolling.
- Large-font/minimum-size Overlay and text-without-spaces: DOM checks found no
  horizontal overflow, pre-wrap/anywhere active; full text remains in the scrollport.
- Font setting: keyboard ArrowLeft, save through the mock command, 95% value and
  success confirmation inspected. Saved Desktop settings were not modified.
- Browser error/warning log inspected: none. Automated tests cover follow/latest,
  reader position, resizing, locked tab order, custom unlock key, font preferences,
  startup and existing Overlay interaction contracts.

### Checklist and remaining limits

- [x] Paired visual comparison and responsive/overflow checks.
- [x] `pnpm test`: 86 frontend tests + 6 Node tests passed.
- [x] TypeScript/Vite production build and `git diff --check` passed.
- [ ] Native user trial of current source with live text and F7 scrolling.
- [ ] Rebuild/re-sign Portable if this revision is accepted; old EXE is unchanged.
- [ ] Physical Windows DPI, clean Windows, GPU performance and full release QA
  remain separate gates. No paid AI/audio capture was run for this revision.

No remaining P0/P1/P2 finding in the tested browser scope. P3: scroll boundary
may show part of an older row, as in an ordinary transcript; the whole row can be
reached without losing text. No change to audio, AI provider, Data or schema v14.
