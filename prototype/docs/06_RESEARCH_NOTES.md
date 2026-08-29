# Verified Research Notes

Checked on 2026-08-29. Provider capabilities, browser support, and pricing are time-sensitive and must be rechecked before launch.

## No-install floating widget

Chrome's Document Picture-in-Picture API can open an always-on-top window populated with arbitrary HTML. Chrome documents desktop launch support, but the API has limited cross-browser availability. WANGAI therefore targets Windows Chrome/Edge first and keeps a normal-page fallback.

- Chrome: https://developer.chrome.com/docs/web-platform/document-picture-in-picture
- Progressive enhancement note: https://developer.chrome.com/blog/document-pip-use-case

Important limitations from the platform:

- A user gesture is required to open Document PiP.
- The site cannot set the PiP window's exact position.
- The PiP window depends on the opener window.

## System-audio capture

`getDisplayMedia()` can request optional system audio, but the user chooses what to share and browser/OS support varies. Permission cannot be persisted and the browser must prompt every time.

- MDN: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia

This makes link-based use feasible, but not silent one-click background capture.

## Clipboard behavior

Clipboard writes require HTTPS and browsers may require focus or transient user activation. The MVP uses a visible Copy button rather than background auto-copy/auto-paste.

- MDN Clipboard API: https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API
- MDN `writeText`: https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/writeText

## PWA installation

A PWA can be opened directly in a browser; installation is optional. If users later want a Start-menu icon and standalone window, Chrome/Edge can offer installation without shipping a traditional installer.

- Chrome migration/PWA note: https://developer.chrome.com/docs/apps/migration/
- web.dev PWA installation: https://web.dev/learn/pwa/installation

## xAI streaming STT

xAI documents a real-time WebSocket STT endpoint, interim results, endpointing, and a requirement to proxy through a backend rather than expose the API key client-side. Thai and English are listed as supported transcription languages.

- Guide: https://docs.x.ai/developers/model-capabilities/audio/speech-to-text
- Model/pricing: https://docs.x.ai/developers/models/speech-to-text

Current published streaming price at the time of research: USD 0.20 per audio hour. This is not a permanent estimate and must be pulled from current provider pricing before budgeting.

## Grok translation

For the MVP translation adapter:

- `grok-4.3`
- reasoning effort `none`
- no web/X search tools
- strict translation-only output

Official model and pricing references:

- https://docs.x.ai/developers/models/grok-4.3
- https://docs.x.ai/developers/pricing

Grok does not remove the need for STT: audio is transcribed first, then finalized text is translated.

## Backend security and WebSockets

Cloudflare Workers supports encrypted secret bindings, WebSocket proxy patterns, and programmable rate-limit bindings. These features fit a thin credential-holding edge API.

- Secrets: https://developers.cloudflare.com/workers/configuration/secrets/
- WebSockets: https://developers.cloudflare.com/workers/runtime-apis/websockets/
- Rate limits: https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/

## Product conclusion

The requested Telegram-like entry experience is feasible as a link-based Chrome/Edge application. The browser-only version can provide an always-on-top widget and two-way translation, but three native-like behaviors remain outside its reliable boundary:

1. Silent/persistent system-audio permission.
2. Global push-to-talk while the game owns focus.
3. Automatic typing into another application.

The MVP should validate click-to-toggle and manual Copy/Paste before authorizing a native companion.
