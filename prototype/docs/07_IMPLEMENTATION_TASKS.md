# Implementation Task Tickets

These tickets turn the approved specification into small, verifiable vertical slices. Do not start Task 2 until Task 1 has an owner-reviewed evidence note.

## Phase A — Feasibility

### Task 1: Browser capability harness

**Description:** Build the smallest page that proves system-audio capture, microphone permission, Document PiP, and complete cleanup without any provider integration.

**Acceptance criteria**

- System audio and microphone tracks are visibly distinguished.
- PiP renders the same live session state as the opener.
- Stop/close ends every track and AudioContext.

**Verification**

- Unit tests cover lifecycle state transitions.
- Manual Chrome/Edge matrix is completed for Discord desktop and one game.
- Browser task manager shows no continuing capture after stop.

**Dependencies:** None.

**Files likely touched**

- `apps/web/src/features/capture/*`
- `apps/web/src/features/widget/*`
- `apps/web/tests/capture-lifecycle.test.ts`

**Estimated scope:** Medium, 3–5 files.

### Task 2: STT proxy vertical slice

**Description:** Stream one selected audio source through a credential-holding Worker to xAI STT and render partial/final transcript events.

**Acceptance criteria**

- The browser bundle and network messages contain no provider key.
- Partial/final/error events pass shared schema validation.
- English and Thai fixture audio produce final events.

**Verification**

- Contract and proxy tests pass.
- Fifty-utterance latency run per language produces p50/p95 metrics.
- Worker closes the upstream socket when the browser disconnects.

**Dependencies:** Task 1.

**Files likely touched**

- `apps/edge-api/src/routes/stt.ts`
- `packages/contracts/src/stt.ts`
- `apps/web/src/features/transcript/stt-client.ts`
- `tests/audio-fixtures/*`

**Estimated scope:** Medium, 4–5 files plus fixtures.

### Task 3: Grok translation benchmark adapter

**Description:** Implement the provider-neutral translation interface and benchmark Grok 4.3 on the fixed EN/TH corpus without connecting it to the main UI yet.

**Acceptance criteria**

- `grok-4.3` runs with reasoning and tools disabled.
- Output is schema-valid and contains translation only.
- Aggregate latency, token cost, intent score, and glossary score are produced.

**Verification**

- Adapter unit tests use mocked provider responses.
- The 300-utterance evaluation report completes with no private test content committed.
- A dummy fallback adapter runs the same contract.

**Dependencies:** Shared contracts from Task 2.

**Files likely touched**

- `packages/translation-core/src/index.ts`
- `apps/edge-api/src/providers/xai-translation.ts`
- `apps/edge-api/src/routes/translate.ts`
- `tests/translation-benchmark/*`

**Estimated scope:** Medium, 4–5 files plus corpus data.

## Checkpoint A — Browser-only go/no-go

- [ ] System audio works for the agreed Windows/Chrome/Edge matrix.
- [ ] PiP remains usable over a representative borderless-windowed game.
- [ ] Thai and English STT meet the approved baseline.
- [ ] Grok quality, latency, and projected cost are accepted.
- [ ] Owner chooses browser-only continuation or companion escalation.

## Phase B — Complete user flows

### Task 4: Incoming EN -> TH slice

**Description:** Connect system audio, STT final events, translation, and the left-aligned incoming message into one end-to-end path.

**Acceptance criteria**

- Only final, non-duplicate English utterances trigger translation.
- Thai translation appears above the original English.
- Timeout retains the English transcript and exposes Retry.

**Verification**

- Integration test proves partial events never trigger provider calls.
- Twenty-minute live Discord/game session completes without duplicate loops.
- p50/p95 end-to-end latency is recorded.

**Dependencies:** Tasks 1–3.

**Files likely touched**

- `apps/web/src/features/session/incoming-controller.ts`
- `apps/web/src/features/widget/IncomingMessage.tsx`
- `apps/web/src/features/translation/translation-client.ts`
- `apps/web/tests/incoming-flow.test.tsx`

**Estimated scope:** Medium, 4 files.

### Task 5: Outgoing TH -> EN slice

**Description:** Add explicit click-to-toggle microphone, Thai transcript finalization, English translation, editing, and Copy.

**Acceptance criteria**

- Microphone begins only after explicit activation.
- User can edit translated English before copying.
- Copy success and denied states are both visible.

**Verification**

- Integration tests cover record/finalize/translate/edit/copy.
- Ten live reply cycles complete with no provider terminology visible.
- Clipboard denial produces a recoverable state.

**Dependencies:** Tasks 2–4.

**Files likely touched**

- `apps/web/src/features/session/outgoing-controller.ts`
- `apps/web/src/features/widget/OutgoingMessage.tsx`
- `apps/web/src/features/widget/MicrophoneControl.tsx`
- `apps/web/tests/outgoing-flow.test.tsx`

**Estimated scope:** Medium, 4 files.

### Task 6: Concurrent source guard

**Description:** Keep incoming listening stable while the user records a reply, without mixing transcript channels or exceeding allowed streams.

**Acceptance criteria**

- Incoming/outgoing events cannot enter the wrong message lane.
- Concurrency and duration limits are enforced locally and server-side.
- Stopping either source does not stop the other unexpectedly.

**Verification**

- State-machine tests cover start/stop/disconnect permutations.
- Five simultaneous incoming/outgoing manual trials remain correctly separated.

**Dependencies:** Tasks 4–5.

**Files likely touched**

- `apps/web/src/features/session/session-machine.ts`
- `packages/contracts/src/session.ts`
- `apps/edge-api/src/session-limits.ts`
- `apps/web/tests/session-concurrency.test.ts`

**Estimated scope:** Medium, 4 files.

## Checkpoint B — Core experience

- [ ] Both translation directions work in one session.
- [ ] User never handles an API key.
- [ ] No microphone/system-audio/provider connection survives End session.
- [ ] Representative-game performance is inside the approved target.

## Phase C — Widget and onboarding

### Task 7: Minimal visual shell

**Description:** Implement the approved collapsed capsule, expanded card, typography, tokens, and message lanes from the UX specification.

**Acceptance criteria**

- Target widget sizes and four text scales do not clip Thai or English.
- Light/dark contrast and reduced motion pass automated checks.
- Latest three turns remain readable without uncontrolled growth.

**Verification**

- Component tests and accessibility checks pass.
- Screenshots are captured at 1280x720, 1920x1080, and 2560x1440.
- Rendered result is compared against the provided reference principles.

**Dependencies:** Tasks 4–6.

**Files likely touched**

- `packages/ui/src/tokens.css`
- `apps/web/src/features/widget/WidgetShell.tsx`
- `apps/web/src/features/widget/widget.css`
- `apps/web/tests/widget-visual.test.tsx`

**Estimated scope:** Medium, 4 files.

### Task 8: Permission onboarding and recovery

**Description:** Build the single-sheet setup flow and precise recovery states for missing/ended permissions and unsupported browsers.

**Acceptance criteria**

- Permission is requested only after the corresponding user action.
- Missing system-audio track and ended share have one clear next action.
- A first-time tester reaches the widget without developer help.

**Verification**

- End-to-end tests cover accept, deny, end, and retry paths.
- Five-user pilot records setup completion and abandonment.

**Dependencies:** Tasks 1, 7.

**Files likely touched**

- `apps/web/src/features/onboarding/SetupSheet.tsx`
- `apps/web/src/features/onboarding/capability-check.ts`
- `apps/web/src/features/widget/RecoveryState.tsx`
- `tests/e2e/onboarding.spec.ts`

**Estimated scope:** Medium, 4 files.

### Task 9: PiP lifecycle polish

**Description:** Synchronize opener and PiP state, styles, focus-safe controls, and graceful fallback behavior.

**Acceptance criteria**

- Closing PiP returns to the normal page without losing the session.
- Ending/closing the opener cannot leave capture running.
- Unsupported Document PiP falls back without losing either translation path.

**Verification**

- Lifecycle tests cover both close directions and reload.
- Manual game-overlay matrix is rerun after final styles.

**Dependencies:** Tasks 7–8.

**Files likely touched**

- `apps/web/src/features/widget/pip-host.ts`
- `apps/web/src/features/widget/widget-bridge.ts`
- `apps/web/src/features/session/session-cleanup.ts`
- `tests/e2e/pip-lifecycle.spec.ts`

**Estimated scope:** Medium, 4 files.

## Checkpoint C — Owner design review

- [ ] Owner reviews one live incoming and outgoing sequence.
- [ ] Collapsed and expanded widget states are accepted.
- [ ] Permission copy is understandable and honest.
- [ ] No native-only behavior is implied in the interface.

## Phase D — Production safety and beta

### Task 10: Anonymous session and abuse controls

**Description:** Protect funded provider endpoints without forcing account creation.

**Acceptance criteria**

- Signed short-lived session is required for paid endpoints.
- Origin, schema, size, duration, rate, and concurrency controls reject abuse.
- Global spend circuit breaker blocks new paid work when triggered.

**Verification**

- Security tests cover forged/expired sessions and oversized requests.
- Staging budget limit is intentionally reached and recovers correctly.

**Dependencies:** Tasks 2–3.

**Files likely touched**

- `apps/edge-api/src/routes/session.ts`
- `apps/edge-api/src/middleware/security.ts`
- `apps/edge-api/src/budget.ts`
- `apps/edge-api/tests/security.test.ts`

**Estimated scope:** Medium, 4 files.

### Task 11: Privacy-safe telemetry and resilience

**Description:** Measure the product without recording content and add bounded recovery for provider/network failures.

**Acceptance criteria**

- Metrics contain latency, status, audio seconds, tokens, and request IDs only.
- Retry logic is bounded and deduplicated.
- 429, 5xx, timeout, disconnect, and permission-ended states are recoverable.

**Verification**

- Log inspection confirms no audio or transcript body.
- Fault-injection and one-hour soak tests produce no orphan connection or retry storm.

**Dependencies:** Tasks 4–6, 10.

**Files likely touched**

- `apps/edge-api/src/telemetry.ts`
- `apps/edge-api/src/retry-policy.ts`
- `apps/web/src/features/session/recovery.ts`
- `apps/edge-api/tests/resilience.test.ts`

**Estimated scope:** Medium, 4 files.

### Task 12: Closed-beta release gate

**Description:** Package the verified web build, operator runbook, privacy notice, and fixed beta measurement plan.

**Acceptance criteria**

- Five-user pilot and twenty-user closed beta criteria from the MVP plan are measured.
- Current provider pricing/retention and supported-browser notes are reverified.
- The owner selects browser-only, optional companion, or native-first continuation from evidence.

**Verification**

- Production build, typecheck, unit/integration/e2e tests all pass.
- Secret scan and browser-bundle inspection pass.
- Release checklist is signed off by the owner.

**Dependencies:** Tasks 1–11.

**Files likely touched**

- `docs/BETA_RUNBOOK.md`
- `docs/PRIVACY.md`
- `docs/RELEASE_CHECKLIST.md`
- deployment configuration

**Estimated scope:** Medium, 3–5 files.

## Checkpoint D — MVP decision

- [ ] Both translation directions meet the approved quality gate.
- [ ] Setup, latency, game impact, and cost per active hour are known.
- [ ] Provider secrets and spend controls are verified.
- [ ] Owner makes the next-platform decision from beta evidence.
