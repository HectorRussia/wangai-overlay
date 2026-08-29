# Product Specification: WANGAI MVP

## Objective

Build a no-install, browser-first communication widget for Thai players in English-speaking online games and Discord calls. It should reduce the delay between hearing, understanding, and replying without touching the game process.

The user opens a URL, grants permissions, and receives two complete communication paths:

1. Incoming: game/Discord system audio -> English transcript -> Thai translation.
2. Outgoing: microphone push/toggle -> Thai transcript -> English translation -> Copy -> manual paste into chat.

## Primary user

A Thai-speaking Windows PC gamer who:

- joins English voice chat in Discord or in-game;
- wants a lightweight experience while the game is running;
- does not want to install or configure AI models;
- should never handle an API key;
- accepts one-time browser permission prompts at the beginning of each session.

## MVP user journey

1. Open the WANGAI HTTPS link in Chrome or Edge.
2. Press **Start session**.
3. Select the game/screen and enable **Share system audio**.
4. Grant microphone permission.
5. Press **Open floating widget**.
6. Hear another person; the widget shows the original English and Thai below it.
7. Click the microphone control; speak Thai; click again to finish.
8. Review the English result and press **Copy**.
9. Return to the game and paste manually.
10. Press **End session** to stop every media track and close the provider connections.

## MVP scope

### Must have

- Windows 11 Chrome/Edge support.
- HTTPS web application; installation is optional, never required.
- System-audio capture with an explicit guided permission flow.
- Microphone capture with a visible recording state.
- Incoming English transcription and Thai translation.
- Outgoing Thai transcription and English translation.
- Floating Document Picture-in-Picture widget with page fallback.
- Original and translated text displayed together.
- Manual Copy action with success/error feedback.
- No user-facing API setup.
- Server-side API secrets, anonymous usage controls, and hard budget caps.
- Provider interfaces so STT and translation can be replaced independently.

### Should have if feasibility permits

- Voice activity detection before sending audio.
- Streaming interim transcript presented as low-emphasis draft text.
- Game-specific glossary/keyterms.
- Font scaling, opacity, and compact/expanded modes.
- Session-only conversation history stored locally in memory.

### Explicitly out of MVP

- Game-process injection, DLL hooks, memory access, or anti-cheat bypasses.
- Automatic typing or automatic sending into game chat.
- Browser-global keyboard shortcuts while another app has focus.
- Voice cloning or translated speech output.
- Multi-speaker identity/diarization guarantees.
- Mobile, macOS, Firefox, and Safari support.
- Account system, cloud transcript history, subscriptions, or payments.
- A promise that the widget works above exclusive-fullscreen games.

## Product success criteria

### Functional

- A new tester reaches the floating widget in at most four explicit actions after opening the link.
- Both translation directions work in one browser session.
- API keys never appear in browser JavaScript, network payloads, logs, or the repository.
- Ending a session stops microphone/display tracks and closes all streaming connections.

### Experience targets

- Incoming finalized translation target: p50 <= 1.8 seconds and p95 <= 3.5 seconds after the speaker finishes.
- Outgoing translation target: p50 <= 1.5 seconds and p95 <= 3.0 seconds after microphone release.
- Widget idle CPU target: under 2% on the agreed test PC.
- Active browser processing target: under 8% CPU excluding the game, measured on the agreed test PC.
- No sustained GPU load from local speech models in the browser MVP.
- Widget remains legible at 1280x720 through 2560x1440.

These are test targets, not current performance claims.

### Quality gate

Use a curated set of at least 300 real game utterances:

- 150 English -> Thai.
- 150 Thai -> English.
- Include clipped speech, accents, slang, names, numbers, and background game noise.
- At least 90% must be understandable without changing the speaker's intent.
- At least 95% of names in the active glossary must remain correct.

## Technical stack baseline

- Frontend: React + TypeScript + Vite, current stable releases pinned at implementation start.
- UI: semantic HTML, CSS variables, lightweight headless primitives only where accessibility needs them.
- State: small explicit session store; no large application framework.
- Browser audio: Media Capture APIs, Web Audio API, AudioWorklet.
- Floating host: Document Picture-in-Picture with normal-page fallback.
- Backend: Hono on Cloudflare Workers.
- Speech-to-text MVP: xAI Streaming STT behind a backend WebSocket proxy.
- Translation MVP: `grok-4.3`, reasoning disabled, behind a provider adapter.
- Validation: Zod schemas shared across browser and Worker.
- Testing: Vitest, Testing Library, Playwright for supported-browser end-to-end tests, and a fixed audio fixture suite.
- Observability: privacy-safe latency/error/usage counters; never raw audio or transcript bodies.

## Why hosted STT is the MVP default

Local Whisper in a browser is possible but conflicts with the core UX: it downloads a large model, uses CPU/GPU beside the game, increases startup time, and varies widely by hardware. Hosted streaming STT gives the no-install version a fair performance test. A local Whisper provider remains a later cost/privacy option.

## Project structure planned for implementation

```text
apps/
  web/                 Browser application and PiP widget
  edge-api/            Secret-holding API and WebSocket proxy
packages/
  contracts/           Shared schemas and event types
  audio-core/          Capture, resampling, VAD, stream state
  translation-core/    Provider-neutral translation contracts
  ui/                  Reusable widget primitives and tokens
tests/
  audio-fixtures/      Licensed/synthetic EN and TH fixtures
  e2e/                 Supported-browser user flows
docs/                  Product, UX, architecture, and decisions
```

## Commands planned

Exact package versions and commands will be locked when the repository is scaffolded. Intended command contract:

```text
pnpm install
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

## Engineering boundaries

### Always

- Keep provider credentials server-side.
- Validate every client/server event.
- Stop and release media resources on end, navigation, and failure.
- Test the two communication directions separately.
- Measure game impact on a defined low/mid-range Windows test machine.
- Keep capture external to the game process.

### Ask the owner first

- Add authentication, payments, transcript storage, or analytics containing content.
- Add a native/installed companion.
- Change from manual paste to any cross-application automation.
- Add another paid provider or persistent database.

### Never

- Commit API keys or paste them into documentation.
- Claim zero anti-cheat risk.
- Store raw audio or transcript content by default.
- Use injection, hooks, memory reads, or automated input to evade game safeguards.
- silently start microphone or display capture.

## Assumptions requiring owner approval

1. MVP targets Windows 11 Chrome/Edge only.
2. Users play in borderless-windowed mode when they need the overlay.
3. Click-to-toggle microphone is acceptable for the no-install version.
4. Manual Copy then Ctrl+V is acceptable for outgoing chat.
5. xAI STT plus Grok 4.3 is acceptable for Goal 0 and the closed beta.
6. No transcript history is retained after the browser session ends.
