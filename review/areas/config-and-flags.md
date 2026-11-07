# Config and Flags

<!-- Owners and paths: the [config-and-flags] section of review/OWNERS. Owners: replace the TODOs. -->

## Context

- `next.config` loading and validation, `NextConfig` types and zod schema, experimental flag plumbing (`define-env`, runtime env), `next.config.ts` compilation, and the Rust side of config.
- TODO: key files and the invariants that must hold

## What failure looks like

- A flag that is typed but not validated (silent typo), a default flipped in the type but not the schema, a flag read in client code with no define-env entry so prod bundles see `undefined`, `next.config.ts` loading differently in dev vs build.
- TODO: past regressions and reverts, with links

## Escalate when

- Any default change in `config-shared.ts` (strong, public); a new experimental key missing in any of type/schema/define-env (strong, flags-wired-end-to-end).
- TODO

## Rules

- TODO

## Preferences

- TODO
