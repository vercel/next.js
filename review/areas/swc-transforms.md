# SWC Transforms

<!-- Owners and paths: the [swc-transforms] section of review/OWNERS. Owners: replace the TODOs. -->

## Context

- The Next.js SWC transforms (`next-custom-transforms`) and the plumbing that selects/configures them for webpack (`next-swc-loader`, `build/swc/options.ts`), Turbopack (`next_shared/transforms`), Jest, and WASM; plus the non-Turbopack napi exports (transform, minify, parse, lockfile, code-frame, React Compiler).
- TODO: key files and the invariants that must hold

## What failure looks like

- The RSC/`use client` boundary transform mis-detects a directive, `next/dynamic` loses its module id, `optimize_barrel`/`cjs_optimizer` drops a re-export, output differs between the Babel fallback and SWC, a transform runs in the wrong environment (edge vs node) and a page 500s.
- TODO: past regressions and reverts, with links

## Escalate when

- Changes to `react_server_components.rs`, `server_actions.rs` (~server-actions), `dynamic.rs`, `optimize_barrel.rs`, or `cjs_optimizer.rs` semantics (strong: every module passes through them); new transform options reaching `NextConfig` (strong, public).
- TODO

## Rules

- TODO

## Preferences

- TODO
