# No test code in prod

rule: Test-only and dev-only code never reaches production bundles: the client, server, and edge runtime code that Next.js ships into apps.

Not in scope: code that only runs in the CLI or at build time (`packages/next/src/cli/**`, `packages/next/src/lib/upgrade/**`, build tooling). An env-var switch there doesn't end up in an app's bundle.

severity: escalate (strong)

## Signs in review

- Test hooks, debug globals, or extra logging in runtime code with no build-time guard
- Dev-only code without `process.env.NODE_ENV !== 'production'`, which is what removes it from prod bundles (see "`NODE_ENV` vs `__NEXT_DEV_SERVER`" in `AGENTS.md`)
- A new `process.env.__NEXT_*` test flag read in client code with no `define-env.ts` entry, so it isn't replaced at build time

## Example

Bad:

```ts
// Exposed so e2e tests can inspect router state
window.__NEXT_ROUTER_STATE = state
```

in a client module that ships to every app.

Good:

```ts
if (process.env.__NEXT_TEST_MODE) {
  window.__NEXT_ROUTER_STATE = state
}
```

`define-env.ts` replaces `process.env.__NEXT_TEST_MODE` at build time (it's `false` unless the test runner sets it), so the branch is removed from production bundles.

## Why

Test code in prod costs every user bytes, and can expose internals.

TODO: scan production bundles for test and dev-only markers, plus bundle-size monitoring.
