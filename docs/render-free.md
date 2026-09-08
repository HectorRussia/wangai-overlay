# Render Free: owner deployment guide

This is an anonymous, single-instance trial service, not a public production
deployment performed by the coding task. No login or per-user billing quota exists.
Anyone who discovers the API can call it; size/concurrency bounds are not authentication.

## Create the service yourself

1. **Revoke/rotate the AI key previously visible in screenshots.** Do not reuse it.
2. Push the reviewed code to `HectorRussia/wangai-overlay` only when ready.
3. In Render, create a Blueprint from this repository and review `render.yaml`:
   Docker, Free, Singapore, one instance, Dockerfile `server/Dockerfile`, context `.`.
   There is no paid disk or external database. Auto-deploy is **off**; deploy manually
   after GitHub CI passes.
4. Fill the `sync: false` environment fields on Render:

   - `STT_API_KEY`: new provider credential.
   - `TRANSLATION_BASE_URL`, `TRANSLATION_MODEL`, `TRANSLATION_API_KEY`: a compatible
     Chat Completions provider/model and credential. STT and translation may use
     different providers, or the same key if the provider supports both tasks.
   - Adjust STT URL/models if needed. The STT model must return segment confidence.
     `TRANSLATION_OPTIONS_JSON` defaults to `{}`; only set model-specific options
     when supported. Do not leave `replace-*`, `<...>` or example values.

   Keys are runtime environment secrets, never Docker build arguments or Git files.
5. Deploy. WANGAI binds `0.0.0.0:10000`. Render terminates public HTTPS; `/healthz`
   is the liveness check, not a proof that provider keys/models are correct.
   Check `/v1/status` for configuration-safe model/status information, then opt in
   to a small **real** speech/translation smoke test (may cost money).
6. Put the resulting `https://...onrender.com` URL in GitHub Actions variable
   `WANGAI_API_BASE_URL`, then build the Desktop release. Changing upstream model,
   key or URL later only needs a server redeploy/restart, not a Desktop update.

## Important Free limits

- Render sleeps after 15 minutes without inbound traffic. Waking can take around
  one minute; users may briefly see connecting/unavailable. Desktop retries service
  status and accepts **new** speech once ready; it does not replay old clips.
- `/data/usage.sqlite3` is on **ephemeral filesystem**, despite the directory name.
  Restarts, redeploys or sleep can erase it. Counts are unsuitable for measuring
  long-term adoption. Free has no persistent disk or normal SSH/dashboard shell
  to run the `wangai-server usage` CLI on the host.
- Outbound provider API traffic is subject to Render Free restrictions and may
  cause suspension. Free is a pilot choice, not an uptime/capacity promise.
- Do not add a keep-alive bot to bypass sleep. Shutdown allowance is 150 seconds;
  in-flight bounded work can finish and metrics can flush, but data remains ephemeral.
- Container runs as UID 10001. `/data` is owned by that user. No local Web Companion
  port is published: the companion remains machine-local on the user's Desktop.
- Provider budget/billing enforcement is separate. WANGAI handles 429 cooldown,
  timeout and billing/config errors; absence of a WANGAI money budget does not
  guarantee that a provider will never charge beyond an expected amount.

For persistent adoption metrics later, deliberately choose a paid persistent
storage/database option; do not quietly attach paid resources to this Blueprint.

[Render Free limits](https://render.com/docs/free),
[Blueprint fields](https://render.com/docs/blueprint-spec),
[Docker services](https://render.com/docs/docker).
