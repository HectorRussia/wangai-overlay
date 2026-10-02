# Dark landing rework — research and direction

## Brief

Rework requested 2026-10-02: dark-first, clean game-focused presentation, literal Thai product positioning, top-right Download and Login only. Avoid vague team metaphors and hardcoded keyboard shortcuts. Google sign-in is a mock until authentication is implemented.

## References and techniques

- [Animos](https://animos.app/): literal headline explaining the output, a short workflow sentence, one primary CTA, then a large product showcase on a nearly black canvas. Applied as clear product-first hierarchy and one dominant interactive demo.
- [Speaak](https://speaak.ai/): a short outcome statement, immediate download, then a concrete demonstration. Applied to scan-friendly Thai copy and a simple path to trying the app, without borrowing unverified metrics.
- [web.dev animation guide](https://web.dev/articles/animations-guide): prefer transform and opacity for animation rather than expensive layout changes. Keep entrance/reveal motion brief, with reduced-motion support.
- [MDN dialog](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog): use native showModal for focus containment and inert background; preserve Escape and an explicit close button. Login UI does not contact Google or persist an account.

Research and main page rework delegated to GPT Astra as requested. Runtime and responsive verification performed separately against the local implementation.

## Visual thesis

Graphite-black canvas, readable off-white Thai typography, mint/cyan accent from the original WANGAI logo, and a cinematic co-op game scene with real HTML subtitle UI. Noto Sans Thai is a local variable font (weight 100–900); strong hierarchy comes from scale and spacing, not thick display type everywhere.

## Content plan

Hero explains voice translation while gaming. The interactive demonstration shows an English phrase becoming a Thai subtitle. Supporting editorial sections explain listening and Thai-to-English text replies, followed by concise FAQ and download.

## Image provenance

Generated with the built-in image generation tool for this project. Not a screenshot of an existing game. Served asset: `public/images/wangai-game-scene.webp` (1672 × 941, approximately 162 KB). Original PNG retained in the user's Codex generated-images folder; WebP is an encoding optimization.

Final generation prompt:

> Use case: stylized-concept. Asset: cinematic background for an interactive product demonstration on Wangai, a speech-translation overlay for PC gamers. Create an original generic cooperative sci-fi video-game environment, landscape 16:9, 1536x864 or similar. A vast weathered industrial hangar/corridor at blue hour, deep graphite slate and muted teal, wet dark metallic floor, distant white daylight through a monumental doorway, two small distant human explorers seen from behind near the right third moving toward the light, restrained atmospheric haze and realistic premium game-engine lighting, subtle warm utility lamps as tiny highlights. Composition wide cinematic establishing shot with broad dark uncluttered center and lower area where real HTML subtitle UI will later be placed. Interesting architectural depth across the upper half, very dark soft perimeter edges for integration into a dark website. Image should feel like an actual sophisticated cooperative game environment, not a marketing gradient or illustration. No lettering, text, HUD, UI, subtitles, windows, computer screens, borders, logos, watermarks, recognizable game franchise, or recognizable characters. No violence. Natural realistic material detail, restrained saturation, elegant and immersive.

## Brand and workflow refinement

Uses the existing W chat-bubble app icon, mint #5ff0bd, cyan #65d8ed and cream #fbebcf. The central demo is a user-controlled, six-step sequence: English app audio, phrase-end transcription/translation, Thai overlay, Thai microphone reply, English text, manual copy/paste into chat. It plays once per activation, supports pause/replay and direct step selection, and honors reduced motion. Timing is illustrative, not a latency claim. No microphone capture, voice synthesis, or automatic message sending occurs.

## Desktop overlay fidelity

The product preview now derives its markup from `src/OverlayApp.tsx` and its scoped presentation rules from the overlay section of `src/styles.css`. It uses the actual W sensor, status row, incoming left-aligned gray bubble, outgoing right-aligned amber bubble, original/translated text hierarchy, and edit-mode copy affordance. The 420 × 236 presentation sits over the illustrative game scene. Configurable shortcut labels are omitted per the marketing brief; toolbar icons are illustrative and do not control desktop settings. Explanation and playback controls remain outside the product window. This is a source-derived interactive preview, not a captured game session.
