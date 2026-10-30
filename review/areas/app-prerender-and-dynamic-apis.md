# App Prerender and Dynamic Apis

<!-- Owners and paths: the [app-prerender-and-dynamic-apis] section of review/OWNERS. Owners: replace the TODOs. -->

## Context

- How App Router decides static vs dynamic: the request APIs (`cookies()`, `headers()`, `params`, `searchParams`, `connection()`, `prefetch()`), staged rendering, PPR postponed state, prerender validation, `generateStaticParams` and fallback shells, the resume data cache.
- TODO: key files and the invariants that must hold

## What failure looks like

- A page that should be static becomes dynamic (or the reverse) with no error; a sync-IO or missing-Suspense error fires wrongly at build; fallback shells serve wrong params; postponed state fails to resume; builds hang on a hanging promise.
- TODO: past regressions and reverts, with links

## Escalate when

- Changes to `RenderStage` ordering, hanging-promise semantics, or what counts as dynamic access (strong); changes to `prerender-manifest` classification fields in `build/index.ts` (medium, shared with build-output).
- TODO

## Rules

- TODO

## Preferences

- TODO
