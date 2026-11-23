# No fake greens

rule: A failing test isn't made to pass by hiding the failure. Known failures use `@gate`.

severity: escalate (strong). Medium if the PR gives a justification.

## Signs in review

- `it.skip`, `describe.skip`, or `.skip` keyed on `process.env`
- `if (isNextDev) { test('skipped', () => {}); return }`
- A raised timeout
- An assertion that was synchronous turned into a `retry()` in the same diff, with no explanation. (`retry()` itself is the normal way to assert on async state.)
- A test changed to pass "in CI" with no account of why it failed

## Example

Bad:

```ts
const { next, isNextDev } = nextTestSetup({ files: __dirname })
if (isNextDev) {
  test('skipped in dev', () => {})
  return
}
```

Good:

```ts
// Prefetching is off in dev, so there's nothing to assert there.
// @force-gate prefetching
describe('segment cache', () => {
  const { next } = nextTestSetup({ files: __dirname })
  // ...
})
```

And for a known bug, `// @gate <cond>` keeps running the test, and fails the day it starts passing. See `test/lib/gate/README.md`.

## Why

A skip says nothing when the bug it hides gets fixed, so it rots. A failure that only shows up in CI is a finding about the code first, not about the runner.

TODO: a CI check for newly added `.skip` and raised timeouts in test files.
