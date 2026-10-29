# React Vendoring

<!-- Owners and paths: the [react-vendoring] section of review/OWNERS. Owners: replace the TODOs. -->

## Context

- The vendored React/React DOM/Flight builds (stable + experimental channels), the `react-server` layer boundary (`entry-base.ts`), the vendored-module shims under `route-modules/app-page/vendored`, the runtime bundle variants, and the sync tooling.
- TODO: key files and the invariants that must hold

## What failure looks like

- A React sync that changes Flight protocol or hydration behavior lands without the matching Next.js change (every App Router page breaks), `react-server` condition violations that only surface in prod workers, stable/experimental channel drift, bundle variant selection picking the wrong build.
- TODO: past regressions and reverts, with links

## Escalate when

- Any React sync PR: must link the upstream React commit range and name behavior changes (strong, already in REVIEW.md as "vendored code"); new import of `react-server-dom-*` outside `entry-base.ts` (strong); changes to `module.compiled.js` selection (medium).
- TODO

## Rules

- TODO

## Preferences

- TODO
