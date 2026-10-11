---
title: Running the packaged Next testing example
description: Run unit, server component, and browser tests from the verified Next package archives.
nav_title: Packaged testing example
---

This example runs unit, server component, and browser tests through `next test`.
Next owns compilation and execution. The authoring imports come from
`next/experimental/testing/*`; no Vitest or Vite runtime is installed.

These commands use the internal, immutable stage-three preview archives, not a
published release. Validation used macOS arm64, stock Node 24.21.0, and Chromium
from Playwright 1.61.0. The same recorded Node executable must run every phase.
Earlier tested Node builds exposed an upstream symlink/FIFO `realpath` issue;
24.21.0 passed the isolated reproduction. This observation does not change the
package's declared Node engine range or establish other platform support.

## Example

The [source in this directory](./) is the runnable example. It includes a pure
function, an async server-only component, an application with a client counter,
and a registered standalone server fixture containing that counter. The verifier
copies these files into an external consumer, so there is one maintained copy.

### Step 1: Install the immutable packages outside the repository

From the repository root, use the validated executable and package handoff:

```sh
TEST_NODE=/tmp/next-testing-stage3-node-v24.21.0/node-v24.21.0-darwin-arm64/bin/node
TEST_PACKAGES=/tmp/next-testing-stage3-L3-packages-v1
TEST_CONSUMER=/tmp/next-testing-example-consumer
TEST_VERIFY=test/e2e/app-dir/next-testing-package/verify-stage3.mjs
"$TEST_NODE" test/e2e/app-dir/next-testing-package/prepare-packed-stage3.mjs \
  "$TEST_PACKAGES" "$TEST_CONSUMER"
```

Choose a fresh consumer directory. Preparation verifies archive hashes and every
installed regular file against the producer manifests, including native/source
provenance. `prepared.json` records the Node executable and its hash. Node, RSC,
and coverage start without browser dependencies. The separate browser phases
install the staged `@next/playwright` archive, Playwright, and Chromium.

`verify-packed.mjs` is a different workflow that packs a local producer. It is
not the immutable archive gate used here.

### Step 2: Run production Node and server component tests

```sh
"$TEST_NODE" "$TEST_VERIFY" "$TEST_CONSUMER" \
  /tmp/next-testing-example-node production-node
"$TEST_NODE" "$TEST_VERIFY" "$TEST_CONSUMER" \
  /tmp/next-testing-example-rsc production-rsc
```

Use a fresh evidence directory for each command. Each phase checks the actual
JavaScript/TypeScript inputs under strict bundler and Node16 module resolution,
with `checkJs` and `skipLibCheck: false`, then invokes the installed CLI from the external consumer directory:

```sh
"$TEST_NODE" node_modules/next/dist/bin/next test . --run --project production-node
```

The selected configuration is copied to `next.test.config.json` by the verifier.
[Production configuration](next.test.production.json) declares the environment,
mode, and file selection explicitly. The two Node cases check production
conditions. The TypeScript [RSC case](production/rsc.case.tsx) renders an async
server-only subject with `rsc.render`, an explicit URL, and file cache scope;
it observes `Packed: production`. This is route-less server output validation,
not browser hydration. Node has distinct JavaScript and TypeScript cases; the
production RSC fixture is TypeScript only.

Each successful verifier prints `Installed … consumer checks passed` and retains
`passed.json`, type inputs, command logs, actual native loads, and process cleanup
evidence. The `production` aggregate runs Node and RSC only.

### Step 3: Check original source line coverage before adding browser packages

```sh
TEST_ORACLE=/tmp/next-testing-L3-reviewed-coverage-expectations-v1.json
"$TEST_NODE" "$TEST_VERIFY" "$TEST_CONSUMER" \
  /tmp/next-testing-example-coverage coverage "$TEST_ORACLE"
```

The independent oracle contains reviewed source hashes and exact executable and
covered line sets. The verifier never derives expectations from its own report.
The [coverage project](next.test.coverage.json) runs two workers and a retry. The
first failed attempt alone takes a discount branch; its successful retry takes
the normal branch. The retained JSON and text report must include the union:
9 of 15 original source lines, or 60%.

This is a mapped-span original-line metric: mapped delimiters count, while
eliminated syntax does not. It covers imported sources in one-shot development
Node execution. It does not establish statement, branch, or function parity,
coverage-provider compatibility, unimported-file coverage, watch coverage, or
browser coverage. The intentional first-attempt assertion remains one attributed
runtime diagnostic despite the final passing retry. Unexpected diagnostics fail
the verifier. `--coverage --update` rejects before execution; coverage and
snapshot updates have no shared commit transaction.

### Step 4: Observe application and registered-fixture hydration

```sh
"$TEST_NODE" "$TEST_VERIFY" "$TEST_CONSUMER" \
  /tmp/next-testing-example-browser production-browser
"$TEST_NODE" "$TEST_VERIFY" "$TEST_CONSUMER" \
  /tmp/next-testing-example-mount mounting
```

The TypeScript production browser case navigates the built application and clicks
its hydrated counter. Registered standalone component mounting is a separate
**development** profile. Its [configuration](next.test.mounting.json) maps the
`greeting` ID to [the async server fixture](mounting/fixture.tsx). Tests mount by
ID with serializable props:

```ts
const fixture = await browser()
const root = await fixture.mount('greeting', { label: 'TypeScript' })
await root.getByRole('button', { name: 'Count 0', exact: true }).click()
await root.getByRole('button', { name: 'Count 1', exact: true }).waitFor()
```

See the complete imports and assertions in [the TypeScript case](mounting/mount-ts.case.ts)
and [the JavaScript case](mounting/mount-js.case.js). Both assert a `/docs/` URL
from `basePath`, server-rendered heading text, hydration, and interaction. Negative
type fixtures reject component values in place of IDs and primitive props. This does not enable production
component mounting or arbitrary in-memory component mounting.

Browser evidence requires one real PNG screenshot and ZIP trace per expected
case/attempt, with unique paths and artifact events before the terminal result.
The production browser phase requires one case; mounting requires both distinct
JavaScript and TypeScript cases. All phases audit owned process cleanup.

## Next steps

When moving existing tests, replace runtime imports with the installed
`next/experimental/testing/vitest` entry point and select an explicit JSON project.
`compatibility: "vitest"` names an authoring subset, not automatic migration of
Vitest configuration, Vite plugins, DOM environments, reporters, or arbitrary APIs.
Use the installed capability manifest and [testing contracts](../../../../NEXT_TESTING_CONTRACTS.md)
to check each API before migration. Browser specs are Node drivers using real
browser fixtures. RSC observations describe the server subtree; use browser
assertions for client behavior.

Keep the [acceptance record](STAGE3_PACKAGING.md) with the exact archive and source
manifests. These isolated test profiles do not certify an ordinary application
build or the separately instrumented `instant()` lane.
