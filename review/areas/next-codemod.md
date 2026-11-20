# Next Codemod

<!-- Owners and paths: the [next-codemod] section of review/OWNERS. Owners: replace the TODOs. -->

## Context

- `@next/codemod` transforms and the upgrade CLI that runs them.
- TODO: key files and the invariants that must hold

## What failure looks like

- A codemod that rewrites code incorrectly on real user repos (missed edge cases, lost comments), or `next-codemod upgrade` installing an incompatible React.
- TODO: past regressions and reverts, with links

## Escalate when

- New transform with no `__testfixtures__` pair (strong, bugfix-regression-test analog); changes to the upgrade version-resolution logic (medium).
- TODO

## Rules

- TODO

## Preferences

- TODO
