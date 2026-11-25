# Router Server Request Handling

<!-- Owners and paths: the [router-server-request-handling] section of review/OWNERS. Owners: replace the TODOs. -->

## Context

- The front door of `next start`/`next dev`: `router-server.ts` + `resolve-routes.ts`, which apply basePath, i18n locale detection/redirects, trailingSlash, `next.config` headers/redirects/rewrites, middleware invocation and proxying to the render server; plus the shared `@next/routing` package and the path/URL normalizers both sides use.
- TODO: key files and the invariants that must hold

## What failure looks like

- Locale redirects loop, basePath stripped twice (or not at all) so a rewrite targets the wrong page, `x-forwarded-*`/`host` trust changes, request smuggling via header filtering, 308 vs 307 flips.
- TODO: past regressions and reverts, with links

## Escalate when

- Any change in how `req.url`/`Location`/`host` is rewritten, header allow/deny lists (`ipcForbiddenHeaders`, `filterReqHeaders`), or status codes (strong); new `NextConfig` routing option defaults (strong, public).
- TODO

## Rules

- TODO

## Preferences

- TODO
