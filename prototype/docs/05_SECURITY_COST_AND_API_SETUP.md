# Security, Cost, and API Preparation

## What the owner prepares

For Goal 0:

1. An xAI Console account with usable API credits.
2. One xAI API key with the minimum available scope.
3. A hard project/team spend limit in the provider console if available.
4. Later, a Cloudflare account for the hosted web app and Worker proxy.

The end user prepares none of these.

## Do not send the API key in chat or documentation

When implementation starts, add it through a secret prompt or local environment file excluded from Git:

```text
XAI_API_KEY=<secret value>
```

Production uses an encrypted Worker secret. The browser receives only a short-lived WANGAI session token. The real xAI key must never be embedded in JavaScript, a PWA manifest, local storage, source maps, analytics, or screenshots.

## Cost centers

### Paid variable usage

1. xAI streaming STT for submitted audio.
2. Grok 4.3 input/output tokens for finalized translations.

### Potential platform cost

- Static hosting and edge requests may fit a free tier during development.
- Production traffic, WebSocket duration, logs, and rate-control infrastructure can introduce hosting cost.
- Domain registration is optional for local development and expected before public beta.

### No direct provider cost

- Browser media capture.
- Web Audio processing.
- Document PiP widget.
- Local VAD and UI rendering.

## Cost-control rules

- Never translate interim STT text.
- Deduplicate finalized utterances.
- Do not send a long rolling conversation; at most two prior turns.
- Keep system prompts stable for provider caching where available.
- Gate silence/music before upstream submission where accurate enough.
- Stop upstream connections immediately when a track ends.
- Cap outgoing PTT duration and maximum utterance length.
- Set per-session, per-day, and global limits.
- Record audio seconds and tokens per successful translation.

## Security controls for a no-login MVP

- Short-lived signed anonymous session tokens.
- Closed-beta invite code before public access.
- Origin allowlist and strict CORS.
- Request schema validation and body limits.
- Per-session request/audio/concurrency rate limits.
- One-time anti-bot challenge only when abuse signals appear.
- Hard provider-spend circuit breaker.
- No transcript content in logs.
- Content Security Policy and restrictive Permissions Policy.

## Privacy defaults

- Capture begins only after a visible user action.
- Persistent visual indicator while microphone or system audio is active.
- End session stops every track and network stream.
- Raw audio is not saved by WANGAI.
- Conversation history lives in browser memory and disappears on session end/reload.
- Metrics contain duration, latency, status, and usage—not what anyone said.

Provider-side processing and retention must be checked again against the current xAI terms before public beta.

## Local development status

- `apps/api` binds only to `127.0.0.1:8787` and accepts only the local Vite origins.
- `POST /v1/translate` validates direction and a 500-character text limit before it calls xAI.
- The key remains server-only. API errors are mapped to generic public messages and do not return provider detail.
- This local proxy is deliberately not a public beta service: it has no end-user session/authentication, invite gate, or durable distributed rate limit. Those controls are required before deployment.

## Threats to test

| Threat | Required mitigation |
|---|---|
| Stolen API key | Key exists only in encrypted backend secret |
| Public endpoint abuse | Signed sessions, invite gate, rate and spend limits |
| Infinite retry cost | Bounded retry with idempotency/deduplication |
| Audio continues after UI close | Central lifecycle controller stops all tracks/sockets |
| Transcript leaks through logs | Structured metadata-only logging |
| Malicious transcript prompt injection | Translation-only system contract, no tools, schema output |
| Cross-origin use of API | Origin validation plus authenticated short-lived session |
| Clipboard surprise | Copy only after explicit click and show confirmation |

## Anti-cheat boundary

WANGAI captures user-authorized audio outside the game process and displays/copies text. It does not inject code, read game memory, hook rendering/input, or automate typing. This reduces invasiveness but does not guarantee that every game's rules allow overlays or external assistance. Public documentation must ask users to review the applicable game's policy.

## Pre-public-beta checklist

- [ ] Rotate any key ever pasted into a message or committed file.
- [ ] Configure encrypted production secret.
- [ ] Confirm `store: false` or equivalent on supported model requests.
- [ ] Confirm current xAI retention and privacy terms.
- [ ] Configure usage alerts and hard limits.
- [ ] Test an intentionally leaked browser bundle for secret absence.
- [ ] Test 429, 5xx, timeout, disconnect, and budget-exceeded behavior.
- [ ] Publish a plain-language privacy notice.
