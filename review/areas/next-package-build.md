# Next Package Build

<!-- Owners and paths: the [next-package-build] section of review/OWNERS. Owners: replace the TODOs. -->

## Context

- How the `next` tarball is produced: `taskfile.js` + ncc precompilation of dependencies into `src/compiled/**` (non-React), the runtime bundle build, `patches/`, and the pre-compiled check.
- TODO: key files and the invariants that must hold

## What failure looks like

- A dependency bump that changes behavior in a precompiled module (e.g. `undici`, `webpack`, `sharp` wrappers) with nothing in the diff but minified output; a runtime bundle variant missing a `process.env` define; tarball size growth.
- TODO: past regressions and reverts, with links

## Escalate when

- REVIEW.md already marks `compiled/**` medium. Add: a `taskfile.js` ncc entry change or a new precompiled package (strong, dependency trigger); `next-runtime.webpack-config.js` define changes (medium, ~react-vendoring).
- TODO

## Rules

- TODO

## Preferences

- TODO
