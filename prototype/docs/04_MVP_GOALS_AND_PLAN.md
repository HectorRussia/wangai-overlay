# MVP Goals and Implementation Plan

## Definition of MVP

A tester opens one URL on Windows Chrome/Edge, shares system audio, opens a floating widget, understands incoming English speech in Thai, speaks Thai to generate an editable English reply, copies it, and ends the session without installing software or handling an API key.

## Dependency graph

```text
Goal 0 browser/provider feasibility
   ├─ system-audio capture proof
   ├─ Document PiP proof
   ├─ xAI STT EN/TH proof
   └─ Grok EN/TH translation benchmark
          │
          ▼
Goal 1 incoming vertical slice
          │
          ├─────────────┐
          ▼             ▼
Goal 2 outgoing     Goal 3 widget polish
          └──────┬──────┘
                 ▼
Goal 4 security, cost, reliability
                 │
                 ▼
Goal 5 closed beta and MVP decision
```

## Goal 0 — Fail-fast feasibility spike

Purpose: prove the browser-only product boundary before building the full interface.

### Task 0.1: System-audio capture matrix

**Acceptance**

- Chrome and Edge on the agreed Windows test PC return a real audio track for the supported share choice.
- Discord desktop audio and one representative game are captured without video being uploaded.
- Ending screen share stops processing and billing within two seconds.

**Verify**

- Manual matrix: Chrome/Edge x Discord desktop/game x screen/window/tab share.
- Record whether `Share system audio` is visible and which choice works.

### Task 0.2: Floating widget proof

**Acceptance**

- Document PiP opens only after an explicit click and renders interactive HTML.
- The widget remains above a borderless-windowed representative game.
- A normal-page fallback works when Document PiP is unavailable.

**Verify**

- Manual capture at 1280x720, 1920x1080, and 2560x1440.
- Record exclusive-fullscreen behavior as observed, not promised.

### Task 0.3: Hosted STT proof

**Acceptance**

- xAI streaming STT produces English and Thai final transcripts.
- p50/p95 finalization latency is recorded for at least 50 utterances per language.
- Real game noise fixtures identify the first accuracy baseline.

**Verify**

- Automated fixture runner plus ten live microphone/system-audio trials.

### Task 0.4: Translation benchmark

**Acceptance**

- Grok 4.3 with reasoning disabled returns schema-valid EN->TH and TH->EN outputs.
- 300-utterance benchmark is scored for intent, names, slang, latency, and cost.
- Provider interface can run the same corpus against a fallback model without UI changes.

**Verify**

- Save aggregate metrics and rejected examples without committing private conversation content.

### Checkpoint 0 — Go/no-go

Proceed only if system audio, PiP, English/Thai STT, and both translation directions pass on the target Windows setup. If global hotkey or exclusive fullscreen is mandatory, stop browser-only implementation and propose the optional companion explicitly.

## Goal 1 — Incoming EN -> TH vertical slice

### Task 1.1: Session shell and permissions

**Acceptance**

- Start session explains and requests only the permission needed at that moment.
- Unsupported/missing audio tracks produce one clear recovery action.
- Stop releases every MediaStream track.

### Task 1.2: AudioWorklet and STT proxy

**Acceptance**

- PCM frames are resampled consistently without blocking the UI thread.
- Browser never receives or transmits the xAI secret.
- Partial/final/error STT events follow a versioned validated contract.

### Task 1.3: Final-utterance translation

**Acceptance**

- Only finalized, deduplicated English utterances trigger translation.
- Thai translation and English original render together.
- Timeout retains the original text and exposes Retry.

### Checkpoint 1

- Twenty-minute Discord/game session completes without a leaked track, duplicate translation loop, or unrecoverable disconnect.
- Latency and CPU targets are measured, not guessed.

## Goal 2 — Outgoing TH -> EN reply slice

### Task 2.1: Click-to-toggle microphone

**Acceptance**

- Recording state is visually and accessibly unambiguous.
- Stop forces a final transcript.
- Mic audio is never captured before explicit activation.

### Task 2.2: Translate, edit, and copy

**Acceptance**

- Final Thai text becomes English through the same provider adapter.
- User can edit the English result before copying.
- Copy success and denied-permission states are clear.

### Task 2.3: Direction and concurrency guard

**Acceptance**

- Incoming audio continues safely while outgoing mic recording occurs.
- UI never mixes an incoming transcript with the user's outgoing bubble.
- Session enforces the agreed concurrent stream limit.

### Checkpoint 2

- A tester completes ten reply cycles without touching settings or seeing provider terminology.

## Goal 3 — Minimal floating widget

### Task 3.1: Design tokens and responsive shell

**Acceptance**

- Collapsed/expanded sizes follow the UX spec.
- Light/dark themes and four text-size presets pass contrast and clipping checks.
- Reduced-motion behavior is verified.

### Task 3.2: Conversation and status states

**Acceptance**

- Incoming, outgoing, draft, translating, copied, permission-ended, and offline states are visually distinct.
- Translation is primary and original text remains visible.
- Latest three turns remain readable without uncontrolled widget growth.

### Task 3.3: Document PiP lifecycle

**Acceptance**

- State remains synchronized between opener and PiP window.
- Closing either surface does not leave microphone/audio/provider sessions running.
- Normal-page fallback preserves the full core flow.

### Checkpoint 3

- Compare the rendered widget to the provided reference principles at all target sizes.
- Owner reviews one live incoming and outgoing flow before polish expands.

## Goal 4 — Security, cost, and reliability

### Task 4.1: Anonymous session security

**Acceptance**

- Short-lived signed session token is required for STT and translation.
- Origin, schema, size, duration, and concurrency limits are enforced.
- API secrets exist only in encrypted deployment secrets/local ignored environment files.

### Task 4.2: Budget and rate controls

**Acceptance**

- Per-session audio minutes and translation request caps exist.
- Daily provider spend circuit breaker can stop new sessions.
- User receives a humane limit message instead of repeated failures.

### Task 4.3: Privacy-safe observability

**Acceptance**

- Dashboard measures latency, failures, audio minutes, translation tokens, and session completion.
- Logs contain no raw audio and no transcript/translation body.
- Provider request IDs allow debugging without content retention.

### Task 4.4: Resilience

**Acceptance**

- Network interruption, provider 429/5xx, permission ending, tab refresh, and PiP close have tested recovery behavior.
- Retries are bounded and never multiply paid translation calls.

### Checkpoint 4

- Threat review complete.
- Hard budget tested in staging.
- One-hour soak test has no orphan connection or uncontrolled retry.

## Goal 5 — Closed beta

### Task 5.1: Five-user internal pilot

**Acceptance**

- Five users complete a session without developer assistance.
- Permission-flow abandonment and unsupported capture modes are recorded.
- No content is collected unless the tester explicitly submits an example.

### Task 5.2: Twenty-user closed beta

**Acceptance**

- At least 80% complete both translation directions.
- Median setup time is under 90 seconds.
- p95 latency, quality score, game impact, and cost per active hour meet the approved gate.

### Task 5.3: MVP decision

Choose one path from evidence:

1. Browser-only remains the product.
2. Browser remains default; optional companion adds hotkeys/WASAPI.
3. Browser-only fails core gaming UX; move to a signed lightweight desktop app.

## Proposed schedule

This is sequence, not a promise of calendar duration:

```text
Milestone A  Goal 0 feasibility and benchmark
Milestone B  Goal 1 incoming vertical slice
Milestone C  Goal 2 outgoing reply slice
Milestone D  Goal 3 widget polish
Milestone E  Goal 4 safety/cost/reliability
Milestone F  Goal 5 closed beta
```

Do not build Milestone D polish before Milestone A proves the no-install flow.

## MVP release gate

- [ ] Both directions pass the fixed corpus and live-session tests.
- [ ] No API secret is exposed client-side.
- [ ] Permission, unsupported browser, and provider failures recover clearly.
- [ ] Budget limits and privacy-safe metrics are active.
- [ ] CPU/GPU/latency measured with a representative game running.
- [ ] Owner accepts the widget design in a live flow.
- [ ] Documentation states the anti-cheat and browser constraints accurately.
