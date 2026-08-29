# Technical Architecture

## Architecture decision

Use a browser-first PWA plus an edge API. The browser owns capture and presentation; the edge API owns credentials, abuse protection, STT proxying, and translation calls.

```text
Windows Chrome/Edge
  ├─ DisplayMedia system audio
  ├─ Microphone media
  ├─ AudioWorklet: downmix/resample
  ├─ lightweight VAD gate
  ├─ normal page + Document PiP widget
  │
  ├── WebSocket ──> Edge API ──> xAI Streaming STT
  │                    │
  └── HTTPS/SSE ───────┴──────> Grok 4.3 translation

No raw audio or transcript persistence by WANGAI
```

## Why this split

- No API secret reaches the browser.
- Provider changes do not require rewriting the widget.
- Audio capture stays external to the game process.
- The UI can be opened from a URL without installation.
- Native capability can be added later behind the same contracts.

## Core contracts

### Audio source adapter

```ts
interface AudioSource {
  start(): Promise<MediaStream>;
  stop(): Promise<void>;
  kind: "system" | "microphone";
}
```

Initial implementations:

- `DisplayMediaAudioSource`
- `MicrophoneAudioSource`

Future:

- `TauriWasapiAudioSource`

### Speech-to-text provider

```ts
interface SpeechToTextProvider {
  open(config: SttSessionConfig): Promise<SttSession>;
}

type TranscriptEvent =
  | { type: "partial"; text: string; sequence: number }
  | { type: "final"; text: string; sequence: number }
  | { type: "error"; code: string };
```

Initial implementation: `XaiStreamingSttProvider`.

Future implementation: `LocalWhisperProvider` or another hosted STT provider.

### Translation provider

```ts
interface TranslationProvider {
  translate(request: {
    sourceLanguage: "en" | "th";
    targetLanguage: "th" | "en";
    text: string;
    context?: readonly string[];
    glossary?: Readonly<Record<string, string>>;
  }): Promise<{ text: string; providerRequestId?: string }>;
}
```

Initial implementation: `XaiGrok43TranslationProvider`.

Future implementations: Gemini Flash-Lite or a local translation model.

## Translation behavior

- Model: `grok-4.3`.
- Reasoning: `none`.
- Tools/search: disabled.
- Input: one finalized utterance plus at most two previous finalized turns.
- Output: strict schema containing only translated text and detected source-language mismatch.
- Never request explanations.
- Do not translate every interim STT update.
- Deduplicate identical finalized utterances before billing.

## Audio pipeline

### Incoming system audio

1. `getDisplayMedia()` requests a user-selected surface and audio.
2. Immediately reject the session with a guided recovery screen if no audio track is returned.
3. Discard video frames after the capture is established; never transmit video.
4. Downmix and resample audio in an AudioWorklet.
5. Apply voice activity gating; do not attempt heavy source separation in MVP.
6. Stream speech frames to the backend STT proxy.
7. Translate only final utterance events.

### Outgoing microphone

1. `getUserMedia()` requests microphone with browser echo cancellation, noise suppression, and automatic gain control where supported.
2. Capture begins only after explicit click/tap.
3. Audio is resampled and streamed to STT.
4. Button release/toggle stop forces utterance finalization.
5. Final Thai transcript is translated to English.
6. The browser writes to clipboard only after an explicit Copy action.

## Noise and game-audio strategy

### MVP

- Browser microphone constraints for echo cancellation/noise suppression.
- AudioWorklet for stable resampling and level measurement.
- Lightweight VAD to prevent silence/music-only traffic where practical.
- STT keyterms for game titles, player names, locations, abilities, and slang.
- Per-source sensitivity control hidden under one `Audio sensitivity` setting.

### Not in MVP

- Demucs/source separation: too heavy beside a game and adds large latency.
- Local browser Whisper: model download and GPU/CPU contention undermine the no-install lightweight promise.
- RNNoise on mixed system audio by default: it can damage speech mixed with effects/music; evaluate only with real fixtures.

## Browser widget hosting

Primary: Document Picture-in-Picture, because it provides an always-on-top window containing arbitrary same-origin HTML.

Fallbacks:

1. Compact normal browser page.
2. Optional installed PWA window.
3. Future Tauri companion for true overlay/global input requirements.

## Backend routes

```text
POST /v1/session                 Issue short-lived anonymous session token
GET  /v1/session/limits          Remaining session budget and capability flags
WS   /v1/stt                     Authenticated proxy to xAI streaming STT
POST /v1/translate               Validated text translation request
POST /v1/telemetry               Content-free performance/error event
```

## Session and abuse model

- No signup for closed MVP.
- One short-lived, signed session token per browser session.
- Invite code or Turnstile at session creation if public exposure begins.
- Limits per session token, not only IP.
- Maximum concurrent STT streams per session: 1 system + 1 microphone, with microphone active only on demand.
- Hard daily xAI budget and automatic circuit breaker.
- Request size, duration, and utterance length caps.

## Data policy

- Raw audio: streamed, never stored by WANGAI.
- Transcript/translation: held in browser memory only by default.
- Backend logs: request IDs, duration, status, token/audio usage, and error code only.
- Model calls: disable provider-side storage where the endpoint supports it.
- Telemetry opt-out available from the first beta.

## Failure behavior

- Provider timeout: retain the original transcript and show **Try again**.
- STT disconnect: reconnect once with jitter; after that require user action.
- Permission ended: stop downstream billing immediately.
- Audio track missing: never pretend to be listening.
- Budget limit reached: stop calls and show a clear session-limit message.
- Unsupported browser: keep a normal page demo but block unsupported live capture with an explanation.

## Deployment topology

```text
Cloudflare Pages/static assets
        +
Cloudflare Worker API/WebSocket proxy
        +
xAI STT and Grok APIs
```

No database is required for the closed MVP. Add persistent storage only when accounts, saved glossary, or subscription/billing becomes real scope.
