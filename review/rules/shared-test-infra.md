# Shared test infrastructure

rule: Changes to shared test infrastructure get an owner's review.

severity: escalate (medium)

## Signs in review

- Changes under `test/lib/**`, `test/lib/e2e-utils/**`, `test/lib/next-test-utils.ts`, `test/lib/router-act.ts`, or the gate conditions
- A timeout or retry added to a shared helper to get one test passing

Not shared:

- A helper under `test/lib/**` that only one suite imports. Check the callers before escalating. A change to it is part of that suite's test, so review it like test code.
- A new entry in `test/lib/gate/conditions.ts` that only reads a new `config.experimental.*` flag. It doesn't change how existing conditions are evaluated, so treat it as part of the PR's own tests.

## Example

Bad: adds a `Promise.race` timeout inside `router-act.ts` to get one flaky test past CI.

Good: fixes the one test, or proposes the helper change on its own with the reason it's right for every caller.

## Why

Every test in the repo depends on these. A change that hides one failure can hide many.
