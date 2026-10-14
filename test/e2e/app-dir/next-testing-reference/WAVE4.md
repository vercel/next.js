# Reviewed wave-four integration evidence

Validated on 2026-09-16 atop wave three plus accepted D v4 packaging.
Aggregate SHA-256: `9a6a37c6b4910f0711b837f3b0b05e48018f043823f7b2a746411eee326d795c`.
Patch hash and apply check passed. No dependency install was required.

This batch includes A SSR-consumer/config wiring, B shared runtime initialization
and artifact source maps, E shared module-loader extraction, K mapped defensive
diagnostics, and I request metadata types. It excludes pending C/D hook fixes and
the public E/F render facade. The known hook conformance failure was not rerun.

## Provenance and results

The five modified Rust files were compared byte-for-byte with A's build worktree.
Copied native SHA-256:
`495503637921907503a86a617e35744846045cd344ceb88ff0004b6292df3949`.
A new preload audited the actual `process.dlopen` path/hash. The earlier validated
binary was preserved separately; it was not used for this wave.

| Check                                                           | Result                                                                               |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Core build and declaration generation                           | Passed, 34.18s                                                                       |
| Four affected compiler/execution/reporting/shared-loader suites | 48/48 passed, 3.665s                                                                 |
| Real CLI deliberate mapped throw                                | Expected exit 1; exact original source at `mapping-negative.case.mjs:4:9`            |
| Real CLI no-map diagnostic                                      | Error message and `/tmp/L-generated-no-map.js:7:3` preserved, labelled `[generated]` |
| Normal development application/browser regression               | 3/3 passed, 37.181s                                                                  |
| Normal instrumented production application/browser regression   | 3/3 passed, 31.057s                                                                  |

The actual CLI failure run contains two deliberate failures and no passing,
skipped or cancelled cases. It uses the same explicit development RSC profile,
with a temporary file containing:

```js
import { it } from 'vitest'

it('mapped deliberate throw', () => {
  throw new Error('L_MAPPED_FAILURE')
})

it('no-map diagnostic fallback', () => {
  const error = new Error('L_NO_MAP')
  error.stack =
    'Error: L_NO_MAP\n    at unavailable (/tmp/L-generated-no-map.js:7:3)'
  throw error
})
```

The first diagnostic points to the original file URL and line 4, column 9; worker
and lifecycle frames also map to their source. The second deliberately supplies
an unavailable frame to exercise fallback without guessed source attribution.
Temporary configuration/file contents were restored in `finally`.

Command form:

```sh
NEXT_TEST_NATIVE_DIR="$PWD/packages/next-swc/native" \
  node --require /tmp/next-testing-L-native-audit-wave4.cjs \
  packages/next/dist/bin/next test \
  test/e2e/app-dir/next-testing-reference --run
```

The temporary config selected only `conformance/mapping-negative.case.mjs`.
Focused command: `pnpm exec jest --runInBand --runTestsByPath` with the compiler,
execution, reporting, and RSC `module-loading.test.ts` suites. Both normal app
regressions use their respective `pnpm test-dev-turbo` / `pnpm test-start-turbo`
commands on `next-testing-reference.test.ts`, with the new `NEXT_TEST_NATIVE_DIR`.
Production was checked because the extracted shared loader serves production
rendering too; it is not evidence of production test-entry compilation.

Logs under `/tmp/next-testing-L-wave4`: `-build.log`, `-mapping-cli.log`,
`-unit.log`, `-dev.log`, and `-prod.log`. The audit preload and temporary harness
are `/tmp/next-testing-L-native-audit-wave4.cjs` and
`/tmp/next-testing-L-mapping-cli.py`.

No source fixes were needed. Original-source attribution is now accepted for
this actual emitted test path; the previous wave's emitted-only diagnostics
remain historical evidence. Hook ownership/drain, public RSC render/observation,
cache-resource integration, generic Node/browser test profiles, production test
entries, and normal-production testing-code omission remain pending.
All watch processes and test servers started here are stopped.
