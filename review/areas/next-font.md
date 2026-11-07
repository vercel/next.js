# Next Font

<!-- Owners and paths: the [next-font] section of review/OWNERS. Owners: replace the TODOs. -->

## Context

- `next/font/google` and `next/font/local`: font data fetching at build, fallback metric generation, the font loader/manifest for both bundlers, and preload injection.
- TODO: key files and the invariants that must hold

## What failure looks like

- Builds fail offline or when Google Fonts changes CSS output, wrong fallback metrics (layout shift), fonts not preloaded, duplicated `@font-face` per page.
- TODO: past regressions and reverts, with links

## Escalate when

- Changes to the Google Fonts fetch/parse path or fallback metric math (medium); `font-data.json` regeneration (comment, check it is the automated workflow).
- TODO

## Rules

- TODO

## Preferences

- TODO
