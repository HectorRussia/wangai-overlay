# WANGAI AI Gateway

Standalone Rust/Axum service. The Windows desktop still captures audio, runs Silero,
filters speech and renders the overlay. This server owns provider credentials and
calls STT / translation providers. It is **not** the localhost Web Companion.

## Local development

Copy `.env.example` to `server/.env`, then edit it locally; never commit credentials.
Set `DATABASE_PATH=usage.sqlite3` when running outside Docker. Select an actual
Chat Completions model supported by your provider; the example model placeholder
is intentionally not usable. From `server/`, run:

```powershell
cargo run --locked
```

In another terminal at the repository root:

```powershell
$env:WANGAI_API_BASE_URL = "http://127.0.0.1:8080"
pnpm tauri dev
```

`.env` loads once at process startup; existing process environment takes precedence.
Change provider, key, model or options and restart the server. No Desktop rebuild is
needed unless the **gateway's own URL** changes. The server does not list or pin
models; it validates configuration locally, and confirms provider access on real
requests. `connected` therefore does not guarantee valid billing/model access.

## Provider compatibility

`STT_BASE_URL` must implement multipart `/audio/transcriptions`, accept
`response_format=verbose_json`, and return `text` plus segments with numeric `start`,
`end`, `avg_logprob`, `no_speech_prob`, `compression_ratio`. Nonempty text without
these fields is rejected as `unsupported_model`; silence may return empty text and
no segments. No implicit fallback to lower-confidence recognition.

`TRANSLATION_BASE_URL` must implement `/chat/completions` with system/user messages
and `choices[0].message.content`. URLs include the provider version prefix (`/v1`
or `/openai/v1`); the gateway appends only the operation path. Providers can differ
between STT and translation. xAI's native speech API is not this STT protocol.

`TRANSLATION_OPTIONS_JSON` defaults to `{}`. Only `temperature`, `max_tokens` OR
`max_completion_tokens`, `reasoning_effort`, and `include_reasoning` are accepted,
with type/range validation. Configure only options supported by the selected model.
No model-specific flags are sent implicitly. No client can override these options.

## Production / Docker

Build context is the repository root. Copy `server/.env.example` to `server/.env`
and fill in server secrets. Keep `DATABASE_PATH=/data/usage.sqlite3` for Compose.

```sh
docker compose -f server/compose.yaml up --build -d
docker compose -f server/compose.yaml exec ai wangai-server usage
# After changing server/.env (restart alone does not reload container environment):
docker compose -f server/compose.yaml up -d --force-recreate
```

Compose binds only `127.0.0.1:8080`. Put an HTTPS reverse proxy in front when deploying
publicly; limit request bodies to at least the gateway's 2 MiB + multipart overhead,
and align proxy timeout with `UPSTREAM_TIMEOUT_SECONDS` (default 15). Do not expose
the desktop's ports 1420/1431 or any native control endpoint. No CORS is enabled:
Desktop Rust makes the calls; the browser companion still controls localhost only.
Disable body/header capture in reverse proxy/APM logs (including audio, transcripts,
authorization, and installation IDs). IP access logs are infrastructure metadata;
disable or restrict their retention according to your published privacy policy.

SQLite uses a named persistent volume. Back it up as operational analytics, restrict
file access, and run **one server instance** in v1: cooldown, capacity and statistics
writer are process-local. The container runs as uid 10001. On SIGTERM it stops
accepting connections, drains requests, then flushes queued statistics. Do not use
`docker compose down -v` unless intentionally deleting all usage history.

Build a distributable desktop with its public gateway URL (not provider secrets):

```powershell
$env:WANGAI_API_BASE_URL = "https://your-gateway.example"
pnpm tauri build
```

Release builds require an HTTPS gateway URL. Debug builds default to loopback 8080.
Settings migrate to v14 with a `settings.pre-v14.json` backup containing legacy
settings/usage. The old Windows Credential Manager entry is neither read nor deleted.
There is no client-side $2 limiter, key form, BYOK fallback or model picker anymore.

## Public contract

- `GET /healthz`: process liveness; no provider call.
- `GET /v1/status`: connected/ready/degraded and model names; no URL/key. A provider
  cooldown is included as `retryAfterMs`.
- `POST /v1/transcriptions`: multipart `file` + `stream` (`incoming` / `microphone`).
  WAV must be PCM16 mono 16 kHz, <=30 seconds, <=2 MiB; bytes are forwarded unchanged.
- `POST /v1/translations`: JSON `{text,from,to,glossary?}`; only en→th or th→en.
  Glossary entries are `{source,target}` in EN→TH direction; reverse is automatic.
  JSON <=64 KiB, text <=16,000 characters, <=200 glossary entries of <=256 bytes each.

POSTs require `X-Installation-Id`, a random UUID persisted by Desktop. This is
**analytics, not authentication**. It can be spoofed, and installations are not
people. Request/error statistics cover accepted, validated AI operations; malformed
requests and capacity rejection before provider admission are not counted as usage.

Errors return `{code,message,retryAfterMs,requestId}` without raw provider messages.
429 respects numeric/date `Retry-After` (fallback 5s, maximum 24h). STT and translation
share a cooldown when origin and key are equal. Invalid model/key or billing errors
pause for 60s; 5xx/timeouts pause for 5s. The gateway and desktop never automatically
replay a clip. Desktop discards queued/pre-cooldown audio; only new speech resumes.
There is no monetary cap: provider rate limits are not spending guarantees.

## Analytics and privacy

Audio/transcript content exists only in memory for the request and is passed to the
configured provider; provider retention is governed by its own policies. SQLite
stores daily install UUID, operation, configured model, success/error counts, audio
milliseconds, total latency and provider-reported token usage. No audio, transcript,
process name/path or key is logged/persisted by this server. `usage` prints daily
aggregates locally; there is no public metrics/admin endpoint. The bounded telemetry
queue logs a safe warning if saturated; analytics may undercount during overload.

## Tests and opt-in paid smoke

```powershell
cargo test --manifest-path server/Cargo.toml --locked
```

Automated tests use loopback mocks, never real providers. A manual smoke explicitly
requires `ALLOW_PAID_SMOKE=1` and your gateway URL; it submits one translation and,
optionally, your `SMOKE_WAV_PATH` audio. It prints no conversation contents:

```powershell
$env:ALLOW_PAID_SMOKE = "1"
$env:WANGAI_API_BASE_URL = "https://your-gateway.example"
# Optional: $env:SMOKE_WAV_PATH = "C:\\qa\\speech.wav"
cargo run --manifest-path server/Cargo.toml --example smoke
```

Native QA before release: choose an app, F8 start/stop without hiding Settings,
F9 reply, source switch during an in-flight request (old result must not appear),
overlay drag/lock, localhost companion parity, server stop/restart, 429 recovery.
Docker deployment and real provider smoke require infrastructure/secrets and are
separate from frontend/browser preview verification.
