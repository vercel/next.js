Wrote verdict to `scripts/integration-to-e2e/validation-results/next-image-legacy.md`.

**Verdict: WARN.** Conversion is largely faithful, but one structural issue and several preservation gaps:

- **fail (4a):** `default-static.test.ts` is in `test/e2e/` but the original was production-only (`static.test.ts` never called `runTests('dev mode')`). Move to `test/production/next-image-legacy/default/` or gate with `isNextDev ? describe.skip : describe`.
- **warn (4d):** `IS_TURBOPACK_TEST ? describe.skip : describe` dedup wrappers dropped in most files — causes duplicate CI runs.
- **warn (1b):** `${dpl}` deployment-id segment dropped from `base-path` and `unoptimized` URL regexes — use `next.getDeploymentIdQuery()`.
- **warn (1a):** `trailing-slash` merged 2 tests → 1; **warn (4b):** `base-path-static` uses a dummy `it('no-op in dev')`; **warn (2a):** `basic` dropped an initial `waitFor(1000)`.
