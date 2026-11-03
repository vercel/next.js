# Turbopack Next Integration

<!-- Owners and paths: the [turbopack-next-integration] section of review/OWNERS. Owners: replace the TODOs. -->

## Context

- The Next.js-specific Rust: `next-core` (entries, import maps, loader trees, Next transforms selection), `next-api` (project, endpoints, routes, module graph, HMR aggregation), the napi bindings, and the JS side that drives them (`build/swc/index.ts`, Turbopack build, `shared/lib/turbopack`).
- TODO: key files and the invariants that must hold

## What failure looks like

- Turbopack output differs from webpack for the same app (missing chunk, wrong layer), incremental rebuilds miss a change or over-invalidate (slow HMR), persistent cache corruption across versions, napi binding ABI mismatch.
- TODO: past regressions and reverts, with links

## Escalate when

- Changes to task boundaries/cache keys (see `turbopack/AGENTS.md`) without a stated invalidation story (medium); changes to `next_import_map.rs` or `next_config.rs` translation (medium); new napi exports (strong, binding ABI).
- TODO

## Rules

- TODO

## Preferences

- TODO
