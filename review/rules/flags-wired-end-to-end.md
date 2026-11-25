# Flags wired end to end

rule: Feature flags are wired end to end: the `config-shared.ts` type, the zod schema in `config-schema.ts`, and `define-env` or the runtime env as needed.

severity: escalate (strong) when the wiring is broken. Adding a flag correctly costs nothing.

## Signs in review

- A new `experimental.*` key in `config-shared.ts` with no `config-schema.ts` entry
- A flag read in client or bundled code with no `define-env.ts` entry
- A flag read in a pre-compiled runtime bundle (e.g. `app-render.tsx`) that's only set through `define-env.ts`

## Example

Bad: adds `experimental.fooBar` to `config-shared.ts` and reads `process.env.__NEXT_FOO_BAR` in a client component, with no schema or define-env entry.

Good: type, schema, and define-env entry in the same PR. See `.agents/skills/flags/SKILL.md`.

## Why

A partly wired flag silently does nothing in some build modes.

TODO: a script that checks every experimental key in `config-shared.ts` has a schema entry.

TODO: design a structured staging system for experiments and flags: each flag declares its stage (e.g. experimental, beta, stable), an owner, and how it's wired, in one place. Wiring and lifecycle checks can then be generated or verified by a script instead of reviewed by hand.
