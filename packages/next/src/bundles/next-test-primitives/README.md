# Next test primitives

The expect, spy, snapshot and assertion diff primitives are pinned to 5.0.1.
The separate `diff` entry bundles `@vitest/utils/diff` to format assertion values
before diagnostic serialization without initializing worker matcher globals in
the parent process.
This bundle does not load the Vitest runner or Vite. Regenerate with
`pnpm --filter=next exec taskr ncc_next_test_primitives`. The task also rebuilds
declarations and collects the dependency licenses.

`patches/@vitest__snapshot@5.0.1.patch` fixes snapshot retry rollback. Upstream
`SnapshotState.clearTest` assigned `undefined` for keys introduced by a failed
attempt, making the subsequent `pack` fail in `normalizeNewlines`. Restoring
existing original keys and deleting keys absent from the original data preserves
rollback semantics when the final retry changes or omits its snapshots. The
focused `test/unit/next-testing-stage2-api/snapshot-retry.test.ts` regression uses
the rebuilt primitive through `next/dist`. No dependency version is changed.

Source reference: Vitest revision `0780a8e5b7967a4168173599e9c74fb79aab2483`,
`packages/snapshot/src/port/state.ts`, with the same affected implementation in
the published 5.0.1 package's `dist/index.js`. The existing bundled MIT license
collection is unchanged by the patch.
