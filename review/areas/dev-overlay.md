# Dev Overlay

<!-- Owners and paths: the [dev-overlay] section of review/OWNERS. Owners: replace the TODOs. -->

## Context

- The Next.js DevTools UI (`<nextjs-portal>` shadow-DOM overlay): error dialogs, code frames, call stacks, hydration diff, dev indicator, segment explorer, request insights panel, and the dev-only server middleware/userspace glue that feeds it.
- TODO: key files and the invariants that must hold

## What failure looks like

- Errors shown with the wrong frame or no source map, the overlay swallowing a real runtime error, overlay CSS leaking into the app, dev-only code reaching prod bundles (no-test-code-in-prod), the overlay adding weight to dev page loads.
- TODO: past regressions and reverts, with links

## Escalate when

- Changes to error serialization/source-map resolution shared with the terminal (`serialized-errors.ts`, `parse-stack.ts`) (medium); any new import from `next-devtools/**` outside a `NODE_ENV !== 'production'` guard (strong).
- TODO

## Rules

- TODO

## Preferences

- TODO
