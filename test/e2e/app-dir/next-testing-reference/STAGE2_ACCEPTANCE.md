# Stage-two independent acceptance matrix

Prepared against the frozen accepted stage-one implementation; no stage-two
capability is accepted or selected yet. Keep `WAVE1.md` through `WAVE9.md` and
raw stage-one logs immutable. Apply only coordinator-reviewed increments, with
matching immutable native provenance whenever the compiler ABI changes.

Baseline patch SHA-256:
`905b73060570553fed495142feb0deda69516b1e8b8e8024b8052e4aa8b6e6ac`.
A private index replay matched all 215 authored implementation/test files in L;
seven coordinator root documents were excluded. The worktree was not patched.
Comparison: `/tmp/next-testing-L-stage2-baseline-comparison.json`.
Native remains `db75772b6be36dee9cfdac5eb968b52141a6e1fc1a1678d37207f4b005614b6a`.
The manifest's `sha256` describes its patch, not the JSON manifest itself.

| Gate                            | Real positive evidence                                                                                                                     | Negative/isolation evidence                                                                                                                           | Producer dependencies                                  |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 1. Ordered compiled setup       | Two async setup modules finish in declared order before spec evaluation; same imported state and real runner hooks                         | Fresh state in a second file; setup rejection prevents spec execution, reports original setup coordinates, and releases owned resources               | I2 contracts, A2 compilation, B2 loading, C2 lifecycle |
| 2. Static factory mocks         | Factory affects actual compiled subject before evaluation; supported original import and async factory semantics; resolved target identity | Factory failure and unsupported forms fail explicitly; second unmocked file sees the real implementation; reserved framework targets remain protected | I2, A2, G2, B2, C2                                     |
| 3. Advertised API and snapshots | Exact supported forms agree with pinned Vitest cases; explicit scoped update writes correct authored snapshot                              | Ordinary runs never write; unrelated/filtered/skipped snapshots remain byte-identical; failure/cancellation follows documented commit policy          | C2, I2, B2                                             |
| 4. Watch/incremental            | Source/setup/spec/config/discovery edits cause fresh correct execution; trusted graph evidence narrows affected files                      | Rapid changes are not lost; failure recovery and cancellation clean up; uncertain graph selection is conservative and agrees with a full run          | J2, A2, I2, B2                                         |
| 5. Packed authoring/execution   | Real local package install resolves public declarations/imports and executes Node/RSC/browser examples with matching compiler              | No repository-only path/module/dependency fallback; missing unsupported capability fails usefully                                                     | P2, I2 and accepted runtime/compiler pair              |
| 6. Combined regression          | Default multi-profile command, canonical rendering/browser behavior, loader closure, ordinary production safety                            | Retain true failure outcomes, terminal ordering, artifacts, no owned process/cache-lock leaks                                                         | Reviewed combined increment                            |

Each gate records exact source/native/dependency hashes, actual command, selected
files, revision/attempt identities, exit status, useful diagnostics and cleanup.
A unit result is not a replacement for compiled execution. A packed import check
is not execution evidence. Reuse the accepted app/subjects and isolate only the
new behavior. Do not launch duplicate broad builds; preserve one combined-build
slot and run focused checks only after a concrete changed capability arrives.

## First fixture: ordered setup and shared collection context

Prepared files under `conformance/setup/` are intentionally excluded from current
positive projects. Proposed first temporary profile (exact public configuration
remains subject to I2's accepted contract):

```json
{
  "name": "reference-setup",
  "environment": "node",
  "mode": "development",
  "setupFiles": ["conformance/setup/first.mjs", "conformance/setup/second.mjs"],
  "include": [
    "conformance/setup/file-a.case.mjs",
    "conformance/setup/file-b.case.mjs"
  ]
}
```

`first.mjs` rejects reused per-file state, starts before an asynchronous boundary,
uses the actual TypeScript sum subject, finishes initialization, and registers
an asynchronous hook with returned cleanup. `second.mjs` checks first setup
completion before its own evaluation and registers another hook/cleanup. Both
specs share a registration helper which checks setup-before-spec evaluation,
exact hook order, sum 10, one case execution, and both cleanups. It intentionally
does not assume an unagreed ordering between returned cleanup functions.

Expected first result: two selected files, one passing case per file, no setup
module collected as a spec, no setup execution from an uncompiled side loader,
and fresh shared state for file B. Then use the same file contents in an RSC
profile when that setup context is advertised. A browser setup profile is a
separate gate if exposed; do not infer its resource lifetime from Node success.

This fixture targets the pinned Vitest revision
`0780a8e5b7967a4168173599e9c74fb79aab2483`. Its actual
`packages/vitest/src/runtime/runner/setup.ts` serially awaits setup imports when
`sequence.setupFiles` is not `parallel`; `runner/collect.ts` awaits setup before
spec collection. A reference run must select sequential setup explicitly; this
does not claim parity with every Vitest configuration/default. The reference
checkout remains read-only. Only syntax, formatting and lint have been checked
for these unselected fixtures, not compilation or runtime compatibility.

The prepared negative gate selects `setupFiles` in order `first.mjs`,
`reject.mjs`, `after-rejection.mjs` and only `after-rejection.case.mjs`.
`reject.mjs` verifies completed first setup, emits `L_SETUP_REJECTION_REACHED`,
then throws `L_EXPECTED_ASYNC_SETUP_FAILURE` after an asynchronous boundary.
Acceptance requires the owning file/run to fail with useful original setup
coordinates, no later setup/spec marker, no executed case, and bounded worker
shutdown/disposal. I2/A2/B2 agree setup rejection stops subsequent imports and
uses collection-failure diagnostics/normal disposal. This does not assert that
never-started test hooks run; browser resource cleanup and snapshot commit policy
remain separate from test-hook execution. These files also remain unselected.

## Claim boundaries

Keep a capability inventory alongside each accepted handoff. Unsupported dynamic
mocking, target categories, snapshot forms, watch changes or package environments
must be rejected explicitly rather than inferred from nearby passing cases.
The stage does not establish production test-entry profiles, browser component
mounting, coverage, editor integrations, broader platforms, arbitrary external
data isolation or wholesale Vitest ecosystem compatibility.
