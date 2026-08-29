# WANGAI

Browser-first MVP for real-time English/Thai communication while playing online games.

## Product promise

Open one secure link, grant microphone/system-audio permission, then use a clean floating widget:

- Other people: English speech -> English transcript + Thai translation.
- You: press the microphone button -> Thai speech -> English text -> Copy.
- End users never provide or see an API key.
- No injection, game hooks, memory reading, automatic typing, or anti-cheat bypass behavior.

## Honest product boundary

The no-install version is feasible on Windows Chrome/Edge using Document Picture-in-Picture as an always-on-top HTML window. It is not equivalent to a native overlay:

- Screen/system-audio permission must be granted again for every capture session.
- A browser-only app cannot provide a reliable global push-to-talk hotkey while the game owns keyboard focus.
- It cannot type directly into another application. MVP uses a visible Copy action and manual paste.
- Exclusive fullscreen and every game's anti-cheat policy are not guaranteed. Target borderless-windowed mode first.

These limits are validation gates, not hidden future problems.

## Documents

1. [Product specification](docs/01_PRODUCT_SPEC.md)
2. [Minimal widget UX specification](docs/02_UX_WIDGET_SPEC.md)
3. [Technical architecture](docs/03_ARCHITECTURE.md)
4. [MVP goals and implementation plan](docs/04_MVP_GOALS_AND_PLAN.md)
5. [Security, cost, and API preparation](docs/05_SECURITY_COST_AND_API_SETUP.md)
6. [Verified browser/provider research](docs/06_RESEARCH_NOTES.md)
7. [Implementation task tickets](docs/07_IMPLEMENTATION_TASKS.md)
8. [Goal 0 manual browser validation](docs/08_GOAL0_MANUAL_BROWSER_MATRIX.md)

## Current status

The local MVP is implemented in `apps/web`: permission-gated game-audio and microphone capture, local Silero VAD that sends only completed speech segments from shared audio, final-utterance translation, right-aligned reply bubbles with explicit Copy, push-to-talk, a compact game-terms field, and a 360 × 220 Document Picture-in-Picture widget. It also has an incoming-audio level meter, `Game` / `Discord` / `Video` VAD profiles, visible `Listening` / `Transcribing` / `Translating` state, bounded committed-only translation context, and stale-translation protection. The VAD model/runtime is loaded only after shared audio starts; it is bundled locally rather than fetched from a third-party CDN.

The local API boundary is implemented in `apps/api`. It reads `GROQ_API_KEY` and `XAI_API_KEY` only from the ignored root `.env.local` file. Browser audio goes to local-only `POST /v1/stt/chunk`, then the API submits it to Groq `whisper-large-v3-turbo`; final text goes through local-only `POST /v1/translate` to the existing xAI translation path. The browser never receives either key. The chunker limits uploads to one per six seconds and discards silent shared-audio chunks locally; the local API adds a rolling 18-request-per-minute circuit breaker. This is not a public deployment: add user authentication and server-side per-user quotas before sharing it publicly.

## Run locally

1. In `apps/api`, run `npm run dev`.
2. In `apps/web`, run `npm run dev`.
3. Open the Vite URL. Development requests under `/v1` proxy to the local API on port 8787.

## Remaining owner validation

Run the manual browser matrix with a real Chrome/Edge tab-audio and microphone permission grant. The local Groq chunk path and xAI translation call are connected, but physical audio quality must be checked with the owner’s actual devices and game/Discord setup. Shared-audio captions arrive after a Silero-detected speech segment ends; push-to-talk replies are sent when the player releases the button.
