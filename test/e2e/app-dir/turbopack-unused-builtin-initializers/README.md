# Unused built-in initializers must preserve invocation effects

Reproduction for the initializer-pruning regression in
[PR #100616](https://github.com/vercel/next.js/pull/100616).
This fixture does not change the framework implementation.

## Expected behavior

`app/effects.js` evaluates three initializers whose result bindings are unused:

- `Array.from([1], callback)` invokes a callback passed **by identifier**.
- `new Map(iterable)` consumes a custom iterator.
- `Object.values(source)` invokes a getter.

The page renders `["callback","iterator","getter"]`. Each integration assertion
checks that one of these observable effects survived. None of the calls has a
`/*#__PURE__*/` annotation. Keep the result bindings unused: reading them would
prevent the pruning that triggers the bug.

## Run

From the repository root, with the selected revision's framework and native
bindings built:

```sh
pnpm test-start-turbo test/e2e/app-dir/turbopack-unused-builtin-initializers
```

The test uses HTTP-rendered HTML, so it does not need a browser or external
services. It uses the default side-effect inference setting and does not skip
development, Webpack, or deployment assertions.

## Compare the reviewed revisions

Apply this fixture-only commit to separate checkouts of these revisions:

| Revision                                                      | Expected production Turbopack result                   |
| ------------------------------------------------------------- | ------------------------------------------------------ |
| `d768085563d520882e200a244a90e068f71a6571` (control)          | Three tests pass; the page contains all three effects. |
| `3616cf1de7b0a9e8575102f405058222465da02e` (reviewed PR head) | Three assertions fail; the page renders `[]`.          |

After selecting each revision and applying the fixture, prepare matching build
outputs before testing:

```sh
pnpm install
pnpm build-all
pnpm test-start-turbo test/e2e/app-dir/turbopack-unused-builtin-initializers
```

Building the native bindings matters: an older published binary or stale local
binary can hide the PR regression. Do not disable
`experimental.turbopackInferModuleSideEffects` to make the assertions pass.
