# Server Request Pipeline

<!-- Owners and paths: the [server-request-pipeline] section of review/OWNERS. Owners: replace the TODOs. -->

## Context

- The render server's per-request lifecycle: `BaseServer`/`NextServer`, route matchers/definitions, route modules (App Route handlers included), component loading, response sending, `after()`, and the Node environment setup for route code.
- TODO: key files and the invariants that must hold

## What failure looks like

- Wrong status code or headers on the response (e.g. 500 pages cached as 200), request bodies read twice or not at all, `after()` callbacks dropped on abort, `NextRequest`/`NextResponse` cookie encoding regressions, route handlers losing `params`.
- TODO: past regressions and reverts, with links

## Escalate when

- Changes to `base-server.ts` response/status/ISR branches (medium), to `NextRequest`/`NextResponse`/cookies public behavior (strong), to `after()` lifecycle (medium).
- TODO

## Rules

- TODO

## Preferences

- TODO
