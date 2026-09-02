# `@gate` — marking a test as known-failing, without lying about it

`it.skip` is a dead end. Nothing tells you when the bug it was hiding gets
fixed, so the test stays skipped, then stays skipped after it would have passed,
and eventually rots. `// @gate` replaces it with a tripwire.

```ts
// Blocked on the optimization that marks a route as fully static when no
// dynamic params are referenced in Server Components.
// @gate !cacheComponents
it('navigate to page with a lazily-generated static param', async () => {
  // body unchanged
})
```

The test **still runs**. Because `cacheComponents` is on for this fixture the
condition is false, so the failure is expected: the suite stays green and the run
logs

```
  ⚠ gated test failed as expected (@gate !cacheComponents)
```

The day the underlying bug is fixed and the body starts passing, CI fails with

```
Gated test passed unexpectedly.

This test is marked `// @gate !cacheComponents`, and that condition is currently
false, so the test was expected to fail — but it passed.
The gate is stale: delete the `// @gate !cacheComponents` pragma (and whatever
workaround came with it).
```

That inversion — condition false + test passes ⇒ **failure** — is the whole
feature. It is lifted from React's `@gate`
(`scripts/jest/setupTests.js`, `scripts/babel/transform-test-gate-pragma.js`),
including the expression grammar, so pragmas read the same in both repos.

## `@gate` vs `@force-gate`

`@gate` **runs** the body and inverts the expectation when the condition is
false (a passing body then fails as stale). `@force-gate` **skips** instead of
running — for a body that isn't worth attempting, giving up the tripwire in
exchange.

| directive | condition | when false | when true |
| --- | --- | --- | --- |
| `// @gate <cond>` | static or lazy | assert-fail (invert; stale if it passes) | run |
| `// @force-gate <cond>` (static) | static | real Jest skip (`○ skipped`) at collection | run |
| `// @force-gate <cond>` (lazy, per-test) | lazy | force-pass the test (skip the body) | run |
| `// @force-gate <cond>` (lazy, on a `describe`) | lazy | skip the **build** and force-pass the suite | build + run |

A **static** `@force-gate` (mode/bundler) is decided while tests are collected,
so it's a real `○ skipped`. A **lazy** `@force-gate` (resolved-config) can't be
known then, so it's decided at runtime once the fixture's config is resolvable:

- On a `describe`, the fixture is set up but the **build is skipped** when the
  condition is false — which is the point, since some fixtures can't build under
  the condition at all (e.g. `revalidate` / `dynamic` route configs under Cache
  Components). Nothing is asserted; every test force-passes.
- Because Jest can't turn a running test into `○ skipped`, a lazy force-gate
  reports the test as **passed with a `⚠ skipped by @force-gate <cond>` warning**,
  not as skipped. A static force-gate keeps the real `○ skipped`.

**Prefer `@gate` when the off state fails for a meaningful reason** — a flag
that changes the behavior of existing surface, where a pass would tell you the
gate is stale. For a new API the off state can only throw, which proves nothing
and costs real browser time, so tests of a new API should typically
`@force-gate` instead. `@force-gate` is also the only option when running the
body is impossible: prefetching is off in dev, deploy has no local build
output, the fixture can't build under the condition.

Both forms work on `it`, `test`, `fit`, `describe`, and their `.only` variants.
A gate on a `describe` applies to every test inside it. Several pragmas may stack
on one call. (Build-skipping applies only to suites where `nextTestSetup` owns
the build — not `skipStart` suites — and to `start`/`dev`, not deploy.)

## Conditions

All condition names are declared in [`conditions.ts`](./conditions.ts) — a typo
fails the whole suite at collection time rather than silently disabling the gate.
There are two tiers:

- **static** — the run's own shape (`dev`, `start`, `deploy`, `mode`,
  `turbopack`, `rspack`, `webpack`, `bundler`, `react18`, `wasm`, `ci`),
  semantic aliases for `!dev` that state the reason rather than the mode
  (`prod`, `prefetching`), plus `FIXME` / `TODO`, which are always false.
- **lazy** — a predicate over the fixture's *resolved* `next.config`
  (`cacheComponents`, `ppr`, `prefetchInlining`, `output`, …), read the first
  time a gate asks for it.

Lazy conditions read the resolved config and never `process.env`, because
`__NEXT_CACHE_COMPONENTS=true` (the `--experimental` shard) is only applied when
the fixture has not set `cacheComponents` itself, and because resolution implies
flags a fixture never mentions — `cacheComponents: true` alone turns on
`experimental.ppr` and `experimental.cachedNavigations`. A gate therefore stays
correct when a fixture's config changes or a CI shard's env var starts or stops
applying.

Add conditions freely; the guidance for doing so is at the top of
`conditions.ts`.

## Covering both states of an experiment: test axes

On top of the dimensions the test matrix already has (mode, bundler, React
version), the suites run once plainly and once per *test axis* — a fixed,
lettered set of alternate flag configurations marked by `__NEXT_TEST_AXIS`.
(Today there is one axis, `A`, an alias for the `--experimental` /
`__NEXT_CACHE_COMPONENTS` run; see `scripts/run-jest.sh`.) A fixture can key
an experimental flag on an axis instead of pinning it — enabled by default,
disabled on that axis:

```js
// next.config.js — pin every dimension except the one under test
const nextConfig = {
  cacheComponents: true,
  experimental: {
    concurrentRouterQueue: process.env.__NEXT_TEST_AXIS !== 'A',
  },
}
```

paired with `// @gate concurrentRouterQueue` on the tests whose expectations
only hold with the flag on (`test/e2e/app-dir/concurrent-router-queue/`). A
plain run — including a local run with no special env — exercises the
feature, while the axis-A run covers the off state — and fails the day the
gated tests start passing. One suite, both states, no new CI job, and no
duplicated fixture. When the off state proves nothing (a new API that throws
or is inert when disabled), pair the keying with a lazy `@force-gate`
instead — `test/e2e/app-dir/use-offline/` — and the axis run skips the
fixture build entirely.

Keep exactly **one** flag varying per fixture (pin the rest, like
`cacheComponents` above) so a red shard still attributes to a single
dimension. The gate itself keeps working either way — lazy conditions read the
*resolved* config, so they observe whatever the fixture decided, not how it
decided it.

To reproduce the disabled (axis) state locally, set the marker the same way
CI does:

```sh
__NEXT_TEST_AXIS=A NEXT_SKIP_ISOLATE=1 pnpm test-start-webpack test/e2e/app-dir/concurrent-router-queue/concurrent-router-queue.test.ts
```

## Expressions

```
// @gate !dev
// @gate mode === 'start' && !cacheComponents
// @gate !(turbopack || rspack)
// @gate output === 'export'
```

`!`, `&&`, `||`, `===`/`!==` (and `==`/`!=`), parentheses, string and boolean
literals. Values are coerced by truthiness in boolean position, so
`@gate prefetchInlining` works even though it resolves to
`false | {maxSize, maxBundleSize}`.

## Conditional logic inside a body: `gate()`

The pragma gates a whole test. For a body that should run under both states
but *assert differently*, import the runtime `gate()` — the same registry,
without the inversion:

```ts
import { gate } from 'next-test-utils'

it('renders the fallback', async () => {
  if (await gate((conditions) => conditions.cacheComponents)) {
    // PPR shell: the fallback is part of the prerender.
  } else {
    // fully dynamic: the fallback streams in.
  }
})
```

The function form mirrors React's `gate(flags => flags.enableFoo)`
(`scripts/jest/setupTests.js`), except it is imported rather than a global,
and async, because a lazy condition reads the booted fixture's resolved
config. A string is also accepted and evaluated in the pragma expression
language: `await gate('cacheComponents && !dev')`. Either way an undeclared
name throws, like a pragma.

`gate()` also works where a pragma cannot attach (`it.each`). Prefer it over
branching on `process.env` for the same reason lazy conditions exist: the env
var is not what the fixture actually resolved.

## How it works

1. `pragma-transform.js` rewrites the pragma into
   `_test_gate([{force,source}], 'it')(...)`. It is a line-oriented regex, not an
   AST transform, so **only the `it(` line changes** and every other line keeps
   its byte offsets — `toMatchInlineSnapshot()` is written back by line/column.
2. `jest-transformer.js` chains that rewrite in front of the SWC transformer
   `next/jest` configures. `jest.config.js` wires it up with
   `withGateTransformer()`.
3. `runtime.ts` installs `_test_gate` and evaluates conditions. A false
   *static* `@gate` is known while tests are collected, so the test registers
   through Jest's native `test.failing` and the inversion is Jest's own. A
   lazy gate can't be decided until the fixture's config resolves, so those
   tests wrap the body and invert the outcome at runtime. The `it`/`test`
   globals are wrapped so a gate on a `describe` reaches the tests inside.
4. `state.ts` holds the fixture `createNext()` registered;
   `NextInstance.getResolvedConfig()` resolves its config out of process (in
   process, `loadConfig` would mutate the Jest worker's `process.env` from the
   fixture's `.env` files).

A suite with no lazy gate never resolves a config, so the cost is zero.

## Limitations

- A pragma the transform would not pick up is a **hard error**, not a no-op:
  blank line in between, `it.each` / `it.failing`, a pragma inside a JSDoc
  block. Reword prose comments that start with `@gate`. A pragma on a
  *skipped* test (`it.skip`, `xit`, …) gets a dedicated error — gating a skip
  is ambiguous, so either remove the skip and let the gate decide, or keep the
  plain skip and drop the pragma. (A skip *without* a pragma is left alone.)
- A `describe`-level gate does not reach `it.each` tests (they bypass the
  `it` wrapper) — branch inside the body with the runtime `gate()` instead.
- A gated-false body that *stalls* rather than throwing wastes the full Jest
  timeout. Under a static gate (native `test.failing`) the timeout counts as
  the expected failure, so the test passes — slowly; under a lazy gate the
  runtime inversion only absorbs thrown errors, so the timeout fails the suite
  anyway. In practice `createRouterAct` and Playwright fail fast instead of
  stalling.
- Only the test body is gated. A failure from an `afterEach` (e.g. the redbox
  matchers) still fails the test.
- `jest.retryTimes(1)` is on for non-dev CI. A stale gate fails deterministically
  on both attempts, but a *flaky* gated-false test now "passes" whenever it
  happens to fail.
- A gated test's title is unchanged (React renames its to
  `[GATED, SHOULD FAIL] …`; we can't, because a lazy gate is not decided when
  titles are fixed). The `⚠ gated test failed as expected` line is the only
  signal in the log today.

## Tests

`test/unit/gate/` covers the transform, the expression language, and the runtime.
The stale-gate *failure* cannot be asserted from inside Jest — a test that must
fail cannot report itself as passing — so it is verified by hand:

```sh
# add `// @gate dev` above a test that passes in start mode, then:
NEXT_SKIP_ISOLATE=1 pnpm test-start test/e2e/app-dir/segment-cache/basic
# => FAIL … Gated test passed unexpectedly … The gate is stale
```

A child-process harness that automates this (the pattern React uses in
`scripts/babel/__tests__/transform-test-gate-pragma-test.js`) is a worthwhile
follow-up.
