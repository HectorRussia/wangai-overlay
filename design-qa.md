# WANGAI design QA

## Evidence

- Source of truth: `prototype/apps/web` at `http://localhost:1421/`
- Source screenshot: `D:\translate_HG\docs\qa\wangai\wangai-prototype-source.png`
- Implementation route: `http://localhost:1420/?preview=1#/settings/overview`
- Settings screenshot: `D:\translate_HG\docs\qa\wangai\wangai-settings-qa.png`
- AI & Terms screenshot: `D:\translate_HG\docs\qa\wangai\wangai-settings-ai-qa.png`
- Expanded overlay screenshot: `D:\translate_HG\docs\qa\wangai\wangai-overlay-qa.png`
- Collapsed overlay screenshot: `D:\translate_HG\docs\qa\wangai\wangai-overlay-collapsed-qa.png`
- Side-by-side comparison: `D:\translate_HG\docs\qa\wangai\wangai-design-qa-comparison.png`

The prototype and Settings comparison were captured at the same 1280 × 720 viewport with DPR 1. The expanded and collapsed overlays were captured at their native presentation sizes of 420 × 236 and 332 × 52.

## Visual comparison

- Typography: the implementation keeps the prototype's compact uppercase eyebrow, heavy WANGAI wordmark, strong primary copy, muted secondary copy, and readable Thai line-height.
- Color: charcoal page and card surfaces, quiet neutral borders, pale green outgoing speech, and green system states match the reference visual language.
- Spacing and shape: the large Settings surface intentionally expands the compact prototype into a five-tab desktop information architecture while retaining its rounded cards, generous outer spacing, compact status pills, and conversation bubbles.
- Icons and assets: Lucide system icons are used consistently. The design does not introduce avatars, decorative imagery, handcrafted SVGs, or browser-only assets from the reference.
- Copy and state: realistic Mistfall Hunter, Silero VAD, Groq, hotkey, budget, and transcript data are shown. The fixed EN→TH and TH→EN product behavior remains visible.
- Overlay hierarchy: incoming Thai translation is primary on the left with English secondary copy; outgoing English translation is primary on the right with Thai secondary copy. The idle capsule preserves the same status language at the reduced size.

## Interaction and accessibility checks

- All five hash routes rendered and reported the correct active tab: Overview, Audio, AI & Terms, Controls, and History.
- Tab navigation was exercised with a real browser click and changed the hash to `#/settings/controls`.
- Every Settings route had `scrollWidth === clientWidth`; no horizontal overflow was found.
- Browser console audit returned no warnings or errors.
- Final translations use the live region while changing partial text remains non-disruptive.
- Controls have keyboard focus styles, Thai copy remains legible, and reduced-motion preferences disable non-essential animation.

## Comparison history

The first browser capture of the overlay exposed a QA-only framing mismatch: the preview was being captured against the full browser viewport instead of the native Tauri window. The initial evidence is retained at `D:\translate_HG\docs\qa\wangai\wangai-overlay-pre-fix-qa.png`. The dev-only preview frame was corrected, then the overlay was recaptured at the exact expanded and collapsed dimensions. This change does not alter production Tauri behavior.

## Verification

- `pnpm build`: passed
- `pnpm tauri build --debug --no-bundle`: passed
- `pnpm test`: 16 passed
- `cargo test`: 26 passed
- `pnpm --dir prototype test`: 57 passed
- `git diff --check`: passed (line-ending notices only)

Final result: passed
