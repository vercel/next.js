# App Router Client

<!-- Owners and paths: the [app-router-client] section of review/OWNERS. Owners: replace the TODOs. -->

## Context

- The in-browser App Router: `AppRouter`/`LayoutRouter`, navigation reducers, redirect/not-found/error boundaries, history and scroll handling, the client bootstrap.
- TODO: key files and the invariants that must hold

## What failure looks like

- Navigations that hang, double-render, scroll to the wrong place, lose state on back/forward, or leak Suspense boundaries; error/not-found boundaries that render the wrong UI; hydration-time bugs in the root.
- TODO: past regressions and reverts, with links

## Escalate when

- Reducer or `CacheNode` shape changes, anything touching `startTransition`/`useActionQueue` ordering, bfcache (medium); new client-side fields on router state (medium, scrutinize-new-state).
- TODO

## Rules

- Any byte added to every page's HTML or to the shared client runtime is strong unless the description quantifies it and says why. See [page-weight](../rules/page-weight.md).

## Preferences

- TODO
