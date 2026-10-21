---
title: Running Vitest-style tests from an installed Next package
description: Keep bare Vitest test imports while setting up Next compilation, editor types, and CI commands in a clean consumer.
nav_title: Installed test migration smoke
---

This example keeps `vitest` imports in JavaScript, TypeScript, setup files, and a
shared matcher helper. Next compiles and runs those files through its test runtime.
The consumer installs local package archives, so workspace resolution cannot hide
an omitted published file or dependency.

## Example

The [migration fixture](migration) contains two small Node tests, one shared
matcher, a setup file, and npm scripts. This is a package-installation and authoring
smoke. It is a starting point for migrating an established suite.

### Step 1: Install the built packages into a fresh consumer

Build the checkout, then run the verifier with the native binary built for that
same checkout:

```sh
pnpm --filter=next build
node test/e2e/app-dir/next-testing-package/verify-migration.mjs \
  /tmp/next-testing-migration-consumer \
  packages/next-swc/native/next-swc.darwin-arm64.node
```

Choose a new output directory. The verifier packs Next, `@next/env`, and the
matching Darwin arm64 native package, installs them with npm, and runs the
consumer's type checks and tests. It writes command output before checking each
result. The final `passed.json` identifies the executable, native binary digest,
projects, and observed records. The initial execution profile is Node 26 on
macOS arm64.

The consumer has no installed Vitest or Vite runtime. The test compiler resolves
bare `vitest` imports when the project enables compatibility:

```json
{
  "compatibility": "vitest",
  "projects": [
    {
      "name": "node-dev",
      "environment": "node",
      "mode": "development",
      "include": ["tests/*.case.*"],
      "setupFiles": ["./setup.ts"],
      "provide": { "label": "installed consumer" }
    }
  ]
}
```

The complete [configuration](migration/next.test.config.json) also declares a
production project using the same test bodies.

### Step 2: Connect editor types and shared setup

A runtime alias does not supply TypeScript declarations. Add the installed adapter
to a test-specific tsconfig:

```json
{
  "compilerOptions": {
    "strict": true,
    "noEmit": true,
    "allowJs": true,
    "checkJs": true,
    "types": ["node", "next/experimental/testing/vitest-global"]
  }
}
```

The [complete tsconfig](migration/tsconfig.json) includes the setup, helper,
JavaScript test, TypeScript test, and matcher augmentation. The verifier checks both bundler and Node16
module resolution with `skipLibCheck: false`, and checks that TypeScript actually
consumed all five files.

The shared helper is a real `.js` file. Its relative `.js` imports therefore name
actual runtime files in both module-resolution modes. Matcher and provided-value
interfaces live in [the separate declaration file](migration/matchers.d.ts). The
retained initial consumer exposed a `.js` specifier targeting a `.ts` helper that
TypeScript accepted and the Next compiler rejected; that resolver gap is separate
from this example.

The [setup file](migration/setup.ts) registers a custom matcher through the
[shared helper](migration/shared-matchers.js). Both tests verify that the helper
and test import the same expectation object, setup runs once per file, and
beforeEach runs before the body. The TypeScript test also checks a typed provided
value and a `vi.defineHelper` callback. This catches separate-runtime and missing
augmentation problems that a package-resolution check cannot detect.

### Step 3: Run the installed commands in CI

From the generated consumer directory:

```sh
npm run typecheck
npm run test:ci -- --outputFile results.json
npm run test:production
```

`--run` makes the command one-shot with an explicit project. `test:ci` publishes a
standard JSON result that CI can retain as an artifact. The verifier exercises
these npm scripts with CI enabled, requires both cases to pass in development and
production, and compares their complete observation records. Its command records
also retain normal child completion and cleanup results.

## Next steps

The [downstream verifier](verify-downstream.mjs) runs existing suites from local
Tailwind CSS and Workflow checkouts through a separate, unpatched Vitest 5.0.4
installation and an installed Next package:

```sh
node test/e2e/app-dir/next-testing-package/verify-downstream.mjs \
  /tmp/next-testing-downstream-consumer \
  packages/next-swc/native/next-swc.darwin-arm64.node \
  /path/to/tailwindcss \
  /path/to/workflow
```

Use Tailwind CSS revision `257dedca20a412ebda722effdf265069232fa8d1` and Workflow
revision `9454d51db0d52d6be9bafea9c70ab6fc3a1ceba4`. Build Workflow's
`@workflow/utils` package first: its error package imports that workspace
dependency through the package's existing `dist` export. The verifier copies
those built dependency files alongside the original sources and package
metadata, then creates the local workspace link in each independent consumer.
It records the exact input bytes and checks them again after each run.

The selected suites include all seven Tailwind utility files, all nine Workflow
utility files, and all seven Workflow error files. The reference passes 277 tests
and 33 existing inline snapshots. The same bodies pass in Node development and
production through Next: 554 tests and 66 snapshots. The verifier compares every
test's file, full name, status and failure messages against the reference. It also
retains the existing Tailwind snapshot serializer and Workflow's dependency mock.
No test body, assertion, snapshot or helper is rewritten.

The runner configuration selects these existing files as three projects sharing
one compiler root, then adds a development and production profile for each. This
checks a bounded monorepo migration with a real workspace dependency. Independent
compiler roots, the complete downstream repositories, other package managers and
the remaining Node/OS/architecture matrix still need their own qualification.
This verifier currently runs on macOS arm64; its result does
not declare the implementation ready for release.

Use the installed `next test --capabilities` output and the current implementation
ledger before selecting another environment or API. The [historical package
example](GUIDE.md) and [stage-three record](STAGE3_PACKAGING.md) retain their own
archive versions and proof; they do not describe this consumer's build.

### Run unchanged DOM suites

The [DOM downstream verifier](verify-dom-downstream.mjs) runs all 29 usehooks-ts
test files from revision `61949134144d3690fe9f521260a16c779a6d3797`. Supply a fresh
physically installed Next consumer with React and React DOM 18.2.0,
`@testing-library/react` 14.2.1, `@testing-library/dom` 9.3.4,
`@testing-library/jest-dom` 6.4.2, jsdom 24.0.0, `lodash.debounce` 4.0.8 and
`@juggle/resize-observer` 3.4.0. The consumer must have no Vitest or Vite runtime.

```sh
node test/e2e/app-dir/next-testing-package/verify-dom-downstream.mjs \
  /tmp/installed-next-dom-consumer \
  /tmp/next-testing-dom-results \
  /path/to/usehooks-ts
```

The verifier explicitly selects development jsdom, globals and the upstream setup
file. It copies the original test sources and helpers without rewriting them,
checks all 165 input digests before and after execution, and removes its fixture
afterward. Its pinned Vitest 5.0.4 reference records require 164 passing cases and
four skipped cases, every case field except elapsed time, and all snapshot
fields. Results retain the actual process completion and cleanup records.

This qualifies this development DOM migration on macOS arm64. Production DOM,
other providers, browser engines, platforms and the full downstream release
matrix remain separate work. Current Node/RSC and real-browser profiles do not
select jsdom merely because test imports use `vitest`.

### Cancel a one-shot editor run

Start `next test --run --api=0` to print a loopback discovery URL with an available
port. Read `/v1/discovery` for the current `run.id` and advertised `controls.cancel`.
Send `POST /v1/runs/<encoded-run-id>/cancel` to that URL, using URL encoding for the
complete ID. A successful request returns a version-one `next-test-control`
acknowledgement before the existing interruption cleanup begins. Stale or
finished run IDs return a conflict response.

The qualified development and production Node runs exit with code 130, publish a
cancelled summary, omit snapshot writes and release their API, application lock,
revision directories and owned processes. The internal three-argument discovery
API remains read-only unless its caller supplies control ownership.

Development Node `next test --watch --api=0` also supports full reruns of a
settled generation. Isolated development Node watch without coverage supports
exact file/profile reruns when discovery advertises `fileControls.rerun`. Select
the ID from `fileControls.entries`; the same physical file in two projects has
two IDs. The [editor protocol guide](../../../../packages/next/experimental/testing/editor-api.md)
describes acknowledgement, stale/conflicting IDs, cancellation and recovery.
Individual case selection, editor debugging, editor snapshot updates and
compatibility with existing editor extensions remain separate work.
