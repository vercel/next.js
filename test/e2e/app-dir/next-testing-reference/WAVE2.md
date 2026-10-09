# Reviewed wave-two integration evidence

Validated on 2026-09-16 atop the wave-one state and canonical L fixture.
Aggregate SHA-256: `94b0fd93a080b50584cee41427e3f3d36b53928f4ea43a379a0dafdd58872dc8`.
The aggregate hash and `git apply --check` passed before application.

A v3, B v2, C lifecycle v2, I orchestration v3, F lifecycle v3 and E composition
v3 are present. D assertions and C assertion wiring are absent. This is a real
Next-owned compiler/executor command check, limited to development RSC context.

## Native provenance

Copied A's approved binary to this worktree's
`packages/next-swc/native/next-swc.darwin-arm64.node`.
SHA-256: `1b61f4cd934ecafa8f95b456819c7691fc18ccb73c5247b2abe139cf2270b184`.
All five modified Rust files matched A's build worktree byte-for-byte:
`crates/next-api/src/{app.rs,lib.rs,testing.rs}` and
`crates/next-napi-bindings/src/next_api/{endpoint.rs,project.rs}`.
A preload audited `process.dlopen`, checked the actual resolved native path and
hash, and rejected any mismatch. The command below did not use the installed
baseline native package.

## Results

| Check                                                                | Result                                                               |
| -------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Core build and declaration generation                                | Passed, 21.92s                                                       |
| Eight focused compiler/execution/lifecycle/CLI/request/render suites | 101/101 passed, 2.852s                                               |
| Actual explicit RSC CLI, ordinary subject + server-only dependency   | Exit 0; 1 file and 2 cases passed; no errors, skips or cancellations |
| Deliberate throw followed by an ordinary case                        | Exit 1; 1 case failed and 1 passed; original message retained        |
| Never-resolving case with 30ms timeout followed by a case            | Exit 1; 1 case failed and 1 cancelled; later body did not execute    |
| Normal application development regression with modified native       | 3/3 passed, 21.1s                                                    |

Positive command, from the validation worktree:

```sh
NEXT_TEST_NATIVE_DIR="$PWD/packages/next-swc/native" \
  node --require /tmp/next-testing-L-native-audit.cjs \
  packages/next/dist/bin/next test \
  test/e2e/app-dir/next-testing-reference --run
```

The canonical JSON config explicitly selects `reference-rsc`, environment `rsc`,
mode `development`, and only `conformance/unit-direct.case.mjs`. Both tests import
`it` from the compiled compatibility facade and use direct throws to validate
real application imports. This establishes execution of the ordinary function
and a server-only dependency, not isolated Server Component rendering.

Negative checks temporarily selected a separate `.case.mjs` file. One threw
`L_EXPECTED_FAILURE`; the other returned a never-resolving promise, with a second
case that would throw `L_SHOULD_NOT_EXECUTE`. Configuration set `testTimeout: 30`,
`hookTimeout: 500`, and `fileTimeout: 2000`. A Python `finally` restored the exact
original JSON and deleted the temporary case. The timeout log contains one
cancelled case and never contains `L_SHOULD_NOT_EXECUTE`.

Normal regression command:

```sh
NEXT_TEST_NATIVE_DIR="$PWD/packages/next-swc/native" \
  pnpm test-dev-turbo \
  test/e2e/app-dir/next-testing-reference/next-testing-reference.test.ts
```

Focused suites: `next-testing-compiler`, `next-testing-execution`,
`next-testing-lifecycle`, `next-testing-cli`, `next-testing-request-context`,
and the three `next-testing-rsc-lifecycle` files (`render`, `render-request`,
`render-request-after`). Executed with `pnpm exec jest --runInBand --runTestsByPath`.

Logs: `/tmp/next-testing-L-wave2-build.log`, `-unit.log`, `-cli.log`,
`-cli-failure.log`, `-cli-timeout.log`, and `-dev.log`, all with the same
`/tmp/next-testing-L-wave2` prefix. Negative exit codes are also recorded in
`/tmp/next-testing-L-wave2-negative-results.json`.

## Remaining gaps

Failure diagnostics retain the error but point to emitted `.next-test` chunk
lines despite the worker's `--enable-source-maps`. Original-source attribution
is not accepted. D assertion APIs, Vitest conformance execution, isolated RSC
render/decode/browser composition, generic Node/browser test profiles,
production test-entry compilation, and normal-production omission remain pending.
The focused render tests do not replace actual renderer acceptance. External
asset graph restrictions remain explicit; unsupported graphs are not passes.
All watch processes and test servers started here have finished or been stopped.
