# Dev Server and HMR

<!-- Owners and paths: the [dev-server-and-hmr] section of review/OWNERS. Owners: replace the TODOs. -->

## Context

- `next dev`: the dev server, both hot reloaders (webpack + Turbopack), on-demand entries, the HMR websocket client, Fast Refresh plumbing, dev bundler setup, and dev-time route compilation.
- TODO: key files and the invariants that must hold

## What failure looks like

- Full reloads instead of HMR, stale modules after an edit, dev server hanging on a route compile, memory growth across edits, the dev server exposing routes cross-site (`block-cross-site-dev.ts`, ~router-server).
- TODO: past regressions and reverts, with links

## Escalate when

- Changes to HMR message handling or invalidation ordering in either hot reloader (medium).
- TODO

## Rules

- TODO

## Preferences

- TODO
