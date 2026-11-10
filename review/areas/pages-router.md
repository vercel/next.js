# Pages Router

<!-- Owners and paths: the [pages-router] section of review/OWNERS. Owners: replace the TODOs. -->

## Context

- Everything specific to `pages/`: `getStaticProps`/`getServerSideProps`/API routes, `_app`/`_document`/`_error`, the pages client router (`next/router`), `next/head`, `next/dynamic` loadables, `next/script`, and the pages build templates/loaders.
- TODO: key files and the invariants that must hold

## What failure looks like

- `getStaticProps` revalidation or fallback behavior changes, `_document` customizations break, client router mis-resolves `href`/`as` with basePath/i18n, `next/head` dedup regressions, `next/dynamic` SSR/no-SSR mismatch.
- TODO: past regressions and reverts, with links

## Escalate when

- Changes to `shared/lib/router/router.ts` navigation/`as` resolution or to `render.tsx` document/head ordering (medium).
- TODO

## Rules

- TODO

## Preferences

- TODO
