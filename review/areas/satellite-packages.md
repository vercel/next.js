# Satellite Packages

<!-- Owners and paths: the [satellite-packages] section of review/OWNERS. Owners: replace the TODOs. -->

## Context

- Small published packages with few shared internals: `eslint-plugin-next`/`eslint-config-next`, `@next/third-parties`, `@next/mdx`, `@next/bundle-analyzer`, `@next/env`, `@next/playwright`, `@next/plugin-storybook`, polyfills, `devlow-bench`, and the public `next/*` entry stubs.
- TODO: key files and the invariants that must hold

## What failure looks like

- A lint rule with false positives blocking CI for users, `@next/env` loading order changes, third-party embeds leaking scripts, a `next/*` entry re-exporting the wrong module.
- TODO: past regressions and reverts, with links

## Escalate when

- Any change to a `next/*` public entry export list (strong); new lint rule enabled by default (strong).
- TODO

## Rules

- TODO

## Preferences

- TODO
