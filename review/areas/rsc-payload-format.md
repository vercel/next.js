# RSC Payload Format

<!-- Owners and paths: the [rsc-payload-format] section of review/OWNERS. Owners: replace the TODOs. -->

## Context

- The wire format shared by server and client: transport tree types, Flight router state, the RSC request/response headers, and the client-side decode/normalize boundary.
- TODO: key files and the invariants that must hold

## What failure looks like

- Client and server disagree on the shape of a segment or router state: navigations render the wrong segment, params/search params mismatch, prefetched entries become unusable, stale deployments break (skew), prerendered payloads in the CDN no longer parse.
- TODO: past regressions and reverts, with links

## Escalate when

- Any change to a `Transport*` type, a header name/value in `app-router-headers.ts`, or the `__next_f` encoding (strong): a prerendered payload must still decode after the change and the PR should say how skew is handled.
- TODO

## Rules

- Any byte added to per-segment payload is strong unless the description quantifies it and says why. See [page-weight](../rules/page-weight.md).

## Preferences

- TODO
