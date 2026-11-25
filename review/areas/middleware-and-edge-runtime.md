# Middleware and Edge Runtime

<!-- Owners and paths: the [middleware-and-edge-runtime] section of review/OWNERS. Owners: replace the TODOs. -->

## Context

- `middleware.ts`/`proxy.ts` and the Edge runtime: the sandbox that runs edge bundles in Node, the edge adapter, edge loaders/templates/plugins for both bundlers, edge-specific SWC assertions, and middleware matching config.
- TODO: key files and the invariants that must hold

## What failure looks like

- Edge sandbox globals polluting between requests, `waitUntil` never awaited, Node APIs silently available in edge during dev but failing in prod.
- TODO: past regressions and reverts, with links

## Escalate when

- Changes to `adapter.ts` header handling or matcher evaluation (strong), sandbox context/global isolation (strong), new edge polyfills (medium).
- TODO

## Rules

- TODO

## Preferences

- TODO
