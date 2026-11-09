# Css and Styling

<!-- Owners and paths: the [css-and-styling] section of review/OWNERS. Owners: replace the TODOs. -->

## Context

- CSS handling in both bundlers: css-loader/postcss/lightningcss/sass pipeline, CSS modules, CSS chunking and ordering, styled-jsx/styled-components/emotion transforms, and how CSS reaches the App Router head.
- TODO: key files and the invariants that must hold

## What failure looks like

- CSS order flips between dev and prod (specificity regressions), styles missing on client navigation, CSS modules hashing changes, FOUC in dev, `@import`/`url()` resolution breaking.
- TODO: past regressions and reverts, with links

## Escalate when

- Changes to chunk ordering or CSS module hash inputs (strong: visible on every site); loader option defaults (medium).
- TODO

## Rules

- TODO

## Preferences

- TODO
