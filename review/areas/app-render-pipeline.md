# App Render Pipeline

<!-- Owners and paths: the [app-render-pipeline] section of review/OWNERS. Owners: replace the TODOs. -->

## Context

- Server-side HTML + RSC streaming for App Router pages: `renderToHTMLOrFlight`, component tree creation, head/script/CSS injection, streaming and inlining of the Flight payload into HTML.
- TODO: key files and the invariants that must hold

## What failure looks like

- Hydration mismatches, duplicated or missing `<script>`/`<link>` tags, broken streaming (hangs, truncated HTML), layout-shift from CSS ordering, every page's HTML growing (the +2.3KB revert lives here: `required-scripts.tsx`, `use-flight-response.tsx`, `stream-ops.node.ts` emit inline scripts on every page).
- TODO: past regressions and reverts, with links

## Escalate when

- Any change to what gets written into the HTML stream (inline script, bootstrap, `__next_f`, head insertion) or to stream ordering/`ReactDOM.preload` calls (medium); `entry-base.ts` exports (strong, react-server boundary).
- TODO

## Rules

- Any byte added to every page's HTML or to the shared client runtime is strong unless the description quantifies it and says why. See [page-weight](../rules/page-weight.md).

## Preferences

- TODO
