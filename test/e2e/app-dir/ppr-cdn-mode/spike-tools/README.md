# PPR-CDN-mode spike tools

Throwaway proxies used for the 1a spike's manual checks (see
`PPR_CDN_MODE_PLAN.md`, 6.2 and 6.5). Delete this folder in 1c, once the
harness work in 1b covers the same cases.

Both sit in front of a running `next start` of this fixture:

```bash
node packages/next/dist/bin/next build test/e2e/app-dir/ppr-cdn-mode
node packages/next/dist/bin/next start test/e2e/app-dir/ppr-cdn-mode -p 4518
```

- `fake-cdn.mjs <cdnPort> <nextPort>`: a copy of `createFakeCDN` from
  `test/e2e/app-dir/segment-cache/cdn-cache-busting/server.mjs`, with its
  header bug fixed (finding 20). It caches any GET whose response isn't
  `no-store`, keyed by URL only, and logs `HIT` and `MISS`.
- `break-refresh.mjs <proxyPort> <nextPort> [mode]`: passes documents through
  and breaks RSC requests (`strip`, `500`, `html`, `drop`, `skew`), or cuts
  `/partial*` documents after the shell (`cut-end`, `cut-drop`). Switch modes
  with `GET /__spike?mode=<mode>`, which also returns request counts per mode.
  Used for finding 18.
