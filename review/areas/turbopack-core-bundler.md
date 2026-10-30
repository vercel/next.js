# Turbopack Core Bundler

<!-- Owners and paths: the [turbopack-core-bundler] section of review/OWNERS. Owners: replace the TODOs. -->

## Context

- The generic bundler: module graph, chunking, resolve, ecmascript analysis/transforms/tree shaking, CSS (shared with css-and-styling), node/browser chunking contexts, node evaluation pool, source maps, plus tracing/benchmark tooling.
- TODO: key files and the invariants that must hold

## What failure looks like

- Wrong tree-shaking removes a side effect, ESM/CJS interop changes break a popular package, source maps point at the wrong line, chunking produces duplicate modules or circular waits (hangs in the browser).
- TODO: past regressions and reverts, with links

## Escalate when

- Changes to side-effect analysis, module canonicalization/merging, or chunking algorithms (medium: core algorithms); snapshot test churn without explanation (comment, grows to medium).
- TODO

## Rules

- TODO

## Preferences

- TODO
