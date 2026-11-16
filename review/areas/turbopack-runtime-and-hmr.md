# Turbopack Runtime and HMR

<!-- Owners and paths: the [turbopack-runtime-and-hmr] section of review/OWNERS. Owners: replace the TODOs. -->

## Context

- The JS runtime embedded in every Turbopack bundle (module loading, async modules, chunk lists, HMR application) and the HMR protocol and dev server.
- TODO: key files and the invariants that must hold

## What failure looks like

- Every Turbopack-built page breaks at load (runtime is in every bundle), HMR applies an update to the wrong module instance, async module cycles hang, runtime size growth on every page (page weight).
- TODO: past regressions and reverts, with links

## Escalate when

- Any change to `runtime-base.ts`/`runtime-utils.ts` semantics (strong: ships in every bundle); HMR protocol message shape (strong, client/server contract).
- TODO

## Rules

- Any byte added to every page's HTML or to the shared client runtime is strong unless the description quantifies it and says why. See [page-weight](../rules/page-weight.md).

## Preferences

- TODO
