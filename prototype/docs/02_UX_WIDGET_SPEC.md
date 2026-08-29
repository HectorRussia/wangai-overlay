# Minimal Widget UX Specification

## Design direction

The provided reference establishes the desired feeling: a small floating conversation card, generous whitespace, soft depth, rounded geometry, and one calm accent. WANGAI should feel more like a native communication surface than a gamer HUD.

Reference: [minimal floating chat widget](assets/minimal-floating-chat-widget-reference.png)

Do not copy the avatar, Siri branding, Messages branding, or exact blue bubble. Preserve only the visual principles.

## Design principles

1. **Translation first:** the translated line is the fastest thing to scan.
2. **Original remains visible:** users can verify names and intent without opening another view.
3. **One action at a time:** Start, speak, copy, stop; never expose model/provider controls in the main flow.
4. **Quiet until needed:** the widget collapses when idle and grows only for active speech or review.
5. **State must be unmistakable:** listening, recording, translating, copied, disconnected, and error states use text plus shape—not color alone.

## Visual language

### Surface

- Warm near-white in light mode; charcoal-black in dark mode.
- 1 px translucent border.
- Soft shadow with no heavy neon glow.
- Optional low-opacity lilac edge light while actively listening.
- Backdrop blur is enhancement only; maintain contrast without it.

### Shape

- Outer radius: 22 px expanded, 999 px collapsed capsule.
- Message radius: 16 px with a small directional corner.
- Controls: circular or capsule, minimum 40 x 40 px hit area.
- Avoid nested cards unless they communicate a different state.

### Typography

- Primary: system UI stack for minimum download and native rendering.
- Thai line height: at least 1.45.
- Translation: 15–16 px, medium weight.
- Original: 12–13 px, regular weight, 60–70% foreground.
- Status/meta: 11–12 px, never all caps.

### Color tokens

```text
surface/light       #FAFAFC
surface/dark        #15161A
text/primary/light  #16171B
text/primary/dark   #F6F6F8
text/muted/light    #747781
text/muted/dark     #A9ACB5
accent              #7768E8
accent/soft         rgba(119, 104, 232, 0.14)
success             #2D9B68
danger              #D95555
```

Final colors must pass WCAG contrast checks in the implemented component.

## Widget geometry

### Collapsed listening capsule

- Default size: 332 x 52 px.
- Contents: status dot/waveform, `Listening to game audio`, expand button, microphone button.
- The capsule does not show a transcript when no speech is active.

### Expanded conversation card

- Default size: 420 x 236 px.
- Minimum size: 340 x 190 px.
- Maximum width: 520 px.
- Shows the latest three completed turns; older turns fade and leave session memory.
- Scroll is available only after manual expansion.

### Incoming message — other person

- Align left.
- Optional 6 px neutral speaker marker; no avatar in MVP.
- Thai translation is the first, larger line.
- English original is directly below at lower emphasis.
- Interim transcript appears as muted text with a subtle live indicator and is replaced in place when final.

Example hierarchy:

```text
เขาบอกให้เราไปรวมกันที่ประตูเหนือ
“He said regroup at the north gate.”
```

### Outgoing message — you

- Align right with a soft accent surface.
- English translation is the first, larger line.
- Thai original sits below.
- A compact **Copy** action is part of the bubble, not a detached toolbar.
- After copy, label changes to **Copied** for 1.5 seconds and remains accessible to keyboard users.

## Primary interaction states

### 1. Ready

Capsule reads `Ready` with a single **Start listening** action.

### 2. Listening

Small live waveform and `Listening to shared audio`. No continuous animation beyond a low-motion level meter.

### 3. Incoming speech detected

Widget expands; draft English appears. Translation begins only after a stable/final utterance to prevent repeated API cost and flicker.

### 4. Microphone recording

User enables microphone permission once, then holds the visible `Hold to speak Thai` control in the widget. While held, it reads `Listening in Thai`; release finalizes the utterance. A timer appears after 10 seconds.

### 5. Translating reply

Thai draft remains visible. The English line uses a restrained shimmer or three-dot progress state; never fake a completed translation.

### 6. Ready to copy

English result is selected visually with a **Copy** button. The user can edit the text before copying in expanded mode.

### 7. Permission or capture ended

Widget does not disappear. It shows which permission stopped and one recovery action: **Share audio again** or **Enable microphone**.

## First-run onboarding

Use one calm setup sheet, not a multi-page tutorial:

1. `Share game/Discord audio` with a 10-second visual instruction.
2. `Allow microphone` with privacy explanation.
3. `Open floating widget`.

Only ask for each permission when the user presses the corresponding control. Explain that screen audio permission cannot be remembered by the browser.

## Accessibility

- Every state has text; waveforms and colors are supplemental.
- Minimum 4.5:1 contrast for normal text.
- Full keyboard navigation while the widget itself is focused.
- `aria-live="polite"` for completed translations; interim words must not spam screen readers.
- Respect reduced-motion settings.
- Provide text size presets: 90%, 100%, 115%, 130%.
- Thai/English direction labels remain available to screen readers even when visually compact.

## UX constraints that cannot be designed away

- Opening Document Picture-in-Picture requires a user gesture.
- The site cannot choose the exact screen coordinates of the PiP window.
- A pure web app cannot own a global push-to-talk shortcut while the game is focused.
- Clipboard behavior can require focus or a user gesture; keep Copy explicitly clickable.
- System-audio capture permission is session-based and must be re-granted.

## Future installed companion enhancement

If closed-beta evidence shows strong demand, a small Tauri companion may add:

- WASAPI loopback without screen sharing.
- Reliable global push-to-talk.
- Click-through overlay positioning.
- Launch at startup.

This is Phase 2 product scope, not required to validate the translation experience.
