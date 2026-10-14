# Reviewed wave-five model-render integration evidence

Validated on 2026-09-16 atop the accepted wave-four lane plus D v4 packaging.
Aggregate SHA-256: `be61f9d8792342f9399fe4c9dd661f794c141436e66bb6911c7775ae29d6a3b6`.
Hash and apply check passed. No dependency install or native replacement occurred.
The actual loaded native remains SHA-256
`495503637921907503a86a617e35744846045cd344ceb88ff0004b6292df3949`.
The five modified Rust source hashes matched the immutable provenance in
`/tmp/next-testing-a-native-v4-495503637921/provenance.json`, not A's newer live tree.

This batch adds actual compiled request manifests/cache metadata, F's request
and file-cache lifetimes, E's model-only renderer facade, B's cache lease and
parent process supervision, and D's hook/cleanup adapter. C hook wiring and
later async-origin fixes are absent. The known hook failure was not rerun.

| Check                                                                          | Result                                                    |
| ------------------------------------------------------------------------------ | --------------------------------------------------------- |
| Core build and declaration generation                                          | Passed, 23.76s                                            |
| Eight affected focused suites                                                  | 86/86 passed, 4.951s                                      |
| Actual CLI `reference-render` project                                          | 3/3 passed, exit 0, final run 4.582s                      |
| Actual `after()` failure retained at cleanup despite asserted render rejection | Expected exit 1, one failed case; original error retained |
| File cache lease cleanup after negative run                                    | No new `next-test-cache-*` directory remained             |
| Normal development application/browser regression                              | 3/3 passed, 20.188s                                       |
| New fixture formatting and ESLint                                              | Passed                                                    |

## Canonical render checks

The additive `reference-render` project selects `conformance/render.case.mjs`.
It imports `rsc` from the current internal `next/dist/experimental/testing/rsc/index`
entry and requests explicit `cacheScope: 'file'` for every render.

- Concurrent renders of the original async `ReferenceSubject` decode a section
  with separate `alice`/`bob` cookie values and the client boundary's initial
  prop `10` in each result. The real renderer executes the nested async
  server-only graph. Assertions inspect root/public props only; no normalized
  nested-child observation or client execution is claimed.
- `RequestCacheProbe` uses a real `use cache` function. Two renders share its
  render token within the explicit file scope. Each registers an async `after()`
  callback that itself awaits cached work; both callbacks complete before their
  respective `rsc.render` promises resolve, sharing the after token too.
- The original nonserializable subject rejects with React's function-to-client
  serialization diagnostic. The assertion matches that diagnostic, not an
  arbitrary rejected promise.

The initial render run was green. The corpus was then strengthened to require
React's serialization diagnostic and concurrent request isolation; the final
unchanged-after-strengthening run above is the acceptance result.

A temporary negative file rendered `RejectingAfterProbe` and asserted the render
promise rejection. Attempt cleanup still failed the test with the original
`L_EXPECTED_AFTER_FAILURE`, demonstrating that catching the rejection does not
hide lifecycle failure. Configuration and the temporary case were restored in
`finally`; the probe remains reusable fixture source.

Actual command:

```sh
NEXT_TEST_NATIVE_DIR="$PWD/packages/next-swc/native" \
  node --require /tmp/next-testing-L-native-audit-wave4.cjs \
  packages/next/dist/bin/next test \
  test/e2e/app-dir/next-testing-reference --project reference-render --run
```

The normal dev regression used `pnpm test-dev-turbo` on the canonical framework
test with the same native directory. Focused `--runTestsByPath` suites cover
compiler, execution, request context, RSC bridge/transport/request composition,
after lifecycle, and assertions. These supplement rather than replace the real
CLI render checks.

Logs under `/tmp/next-testing-L-wave5`: `-build.log`, `-unit.log`,
`-render-final-cli.log`, `-after-failure.log`, `-dev.log`, and `-fixture-lint.log`.
Earlier render logs are preserved. All watch processes and test servers started
for this wave are stopped.

## Scope limits

The facade returns decoded React model data. It does not provide DOM, HTML,
normalized server-subtree observations, client execution, or browser mounting.
Persistent caches intentionally share a file lifetime; per-case cold caches,
custom/platform handlers, broader external-data isolation, and full deployment
cache semantics are not established. Hook assertion ownership/drain, generalized
Node/browser test profiles, production test-entry compilation, and normal
production testing-code omission remain pending. No artifact-v2 candidate or
newer native was mixed into this v1 validation lane.
