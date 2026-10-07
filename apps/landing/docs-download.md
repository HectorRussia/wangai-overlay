# Direct Windows downloads

All three download buttons link to `/download/windows`. This server route reads the
public GitHub Latest release API for `HectorRussia/wangai-overlay` and returns a
temporary HTTP 302 redirect to its Windows x64 executable. GitHub serves the
file download; the landing server does not proxy the binary.

It prefers `WANGAI_<version>_x64-portable.exe`, with
`WANGAI_<version>_x64-setup.exe` supported for installer releases. Update ZIPs,
signatures, drafts and prereleases are never download targets. Release notes
remain available through the separate GitHub Releases link.

## Publishing a new version

1. Build, verify and upload the versioned executable with the other release assets.
2. Publish the release as stable and mark it Latest in GitHub.
3. Check `/download/windows` redirects to that exact executable.

The website does not require a rebuild or a changed URL for each version. Release
metadata is cached for 60 seconds; redirect responses use `Cache-Control: no-store`.
There is no permanent redirect that could pin browsers to an older version.
If GitHub is unavailable, rate-limited, or has no matching executable, the route
returns a Thai retry message with HTTP 503 and `Retry-After: 60`.

This requires the existing Next.js server deployment (e.g. Vercel); a static HTML
export cannot run the download route. No GitHub token is needed for public releases.

## Verification

- `pnpm test:download`: release selection, future version, installer fallback,
  unsafe/missing assets, and GitHub failures with mocked API responses.
- `pnpm build` and `pnpm lint`.
- With a production server running, `pnpm check:seo` verifies all three button links and
  the structured download URL. Inspect the route's 302 Location separately against
  the live GitHub release without downloading the full binary:
  `DOWNLOAD_CHECK_URL=http://127.0.0.1:3101 node scripts/check-download.mjs`.
