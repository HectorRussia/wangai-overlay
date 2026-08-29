# Goal 0 manual browser validation

## Purpose

Validate the permissions and user-facing fallback behavior that automated tests cannot safely exercise: real screen/system-audio selection and real microphone permission.

## Preconditions

- Windows 11, current Chrome or Edge.
- Start in a normal browser tab (not an installed app).
- Use a harmless audio source such as Discord test audio or a browser video first. Test a game only in borderless-windowed mode.

## Test matrix

| Step | Action | Expected result | Result |
| --- | --- | --- | --- |
| 1 | Open WANGAI and select **Start session**. | Two source controls appear; no API-key or provider configuration is visible. | ☐ |
| 2 | Select **Share game audio**. In the browser picker, choose a source and enable its audio-sharing option if offered. | Browser owns the permission prompt; WANGAI changes to **Listening to shared audio** only when an audio track is returned. | ☐ |
| 3 | Cancel the picker. | A clear retry message appears; no capture remains active. | ☐ |
| 4 | Select **Enable microphone** and allow the browser prompt. | Control changes to **Connected**. | ☐ |
| 5 | Select **Open floating widget**. | A compact 360 × 220 always-on-top browser widget opens and shows current ready/listening state. | ☐ |
| 6 | Select **End session**. | All active captured tracks stop and the UI returns to the first state. | ☐ |
| 7 | Repeat steps 2–6 with the target game in borderless-windowed mode. | Record whether the chosen source exposes an audio-sharing option and whether the game remains stable. | ☐ |

## Evidence to record

- Browser and version.
- Selected source type (tab, window, or entire screen) and whether system audio was offered.
- Whether the Document Picture-in-Picture window opened.
- Any capture error wording.
- Game mode and whether the game itself was unaffected.

## Gate to Goal 1

Move to the AudioWorklet/VAD/transcription slice only after at least one Chrome or Edge run returns a real shared-audio track and a real microphone track. This app must never request a workaround involving injection, hooks, memory reads, or anti-cheat evasion.
