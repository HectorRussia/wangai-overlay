# Dark landing rework — research and direction

## Current gameplay background

The atmospheric hangar background is replaced by `public/images/wangai-first-person.webp`. Built-in image generation produced the original first-person gameplay illustration, then Sharp encoded it as WebP. HTML adds a crosshair and teammate indicator. The source-derived WANGAI overlay sits bottom-left, keeping the weapon and reticle clear. This remains an illustrative scene, not a screenshot of a released game.

Final generation prompt:

> Use case: stylized-concept. Create an original FIRST PERSON PC cooperative tactical video game gameplay frame, wide landscape 16:9. Clearly an active player's eye-level view, NOT a cinematic establishing shot or wallpaper. Foreground lower RIGHT: large visible gloved hands holding a compact fictional sci-fi carbine at low ready, strong recognizable first-person weapon silhouette covering lower-right 25 percent. Midground center-left: a nearby teammate 5 meters ahead in blue-gray tactical gear running around a waist-high concrete barricade into an industrial courtyard, body full visible. Eye-level 85-degree game camera, ordinary utilitarian loading yard with shipping containers, concrete doorway and catwalk, daylight, realistic crisp game-engine shading, readable midtones, muted colors, no film depth-of-field, no dramatic vista, no mountains, no fog wall, no oversized architecture. Leave lower LEFT quarter relatively uncluttered (plain concrete foreground) where actual HTML software overlay will be placed later. Gameplay action and immediate spatial context, not promotional key art. No shooting, blood or injury. NO text, letters, logos, UI, HUD, crosshair, watermark or recognizable existing game franchise; crosshair and teammate indicator will be added in HTML. Both hands anatomically correct. Strong first-person perspective is the most important requirement.

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

## Six gameplay scenes

The demo now offers FPS, fantasy, survival, farming, racing and space, with genre-specific bilingual examples. Scene switching is manual by default; optional cycling advances every eight seconds and can be stopped. Selecting a scene stops cycling. The desktop-derived overlay remains consistent. Asset paths and generation prompts are in [SCENE-ASSETS.md](SCENE-ASSETS.md).

## FPS-only refinement

The current landing demo uses only FPS; genre selection and automatic scene cycling were removed. A separate explanatory voice annotation points to the teammate and shows the incoming English line. Playback animates its voice indicator before pending translation and the Thai bubble. This annotation belongs to the demonstration, not the desktop overlay. Reply mode identifies the player's Thai microphone speech separately.

## Automatic playback

The FPS flow starts automatically when at least 30% of the game stage is visible and loops through all six steps. It pauses outside the viewport, while the browser tab is hidden, or while a demo control has focus so users can inspect a step or copy a reply. The explicit play/replay button is removed. Timers and observers are cleaned up on unmount.

## Motion and neutral palette refinement

References reviewed: Speaak (https://speaak.ai/#how), Linear's 2026 interface refresh (https://linear.app/now/behind-the-latest-design-refresh), and Material motion guidance (https://m3.material.io/styles/motion/overview/how-it-works).

Use a single synchronized sequence below the real FPS overlay: source waveform, WANGAI processing pulse, then translated text revealed in short word groups. Incoming and outgoing examples share the existing six-step timeline, rather than introducing another carousel or redundant section. The translated reply is text for the user to say or send themselves; it never implies synthesized voice or automatic sending. These animations explain the example; their duration is not a product latency claim.

Replace green-tinted page and panel fills with charcoal (#0b0c0f, #17181c, #202127). Retain logo mint for signal, selection, and primary actions. Mobile stacks the output below the source and engine. Respect reduced-motion through CSS, and keep continuous effects tied to the existing viewport and tab-visibility state.
