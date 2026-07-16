# Plan: shell-extractable ("rewindable") per-segment PPR prefetches

> Handoff planning doc. Self-contained — assumes no prior conversation context.
> Written for a fresh session to start implementing from.

## TL;DR

Give each per-segment prefetch response a **shell byte boundary** — a segment-level
analogue of the whole-route `a` field — so the client can truncate a segment's
buffered response and re-decode the prefix into an **intra-segment shell variant**
(the param-dependent content *within* a single segment reduced to `Fallback`). This
mirrors, at the segment grain, the shell-extraction the whole-route/navigation path
already does via `resolveShellStageData` + `decodeStageUntilBoundary`.

The load-bearing difficulty lives in
`packages/next/src/server/app-render/collect-segment-data.tsx`
(function `renderSegmentPrefetch`).

## Environment / base branch

- This worktree is based on **`origin/canary`** (the repo default branch).
- The original feature branch this task was spun off from,
  `worktree-navlock-shell-restriction` (PR **#95150**, "instant(): Only render
  shell, unless prefetch prop is set"), is **already MERGED** into canary and its
  remote branch was deleted. Do **not** base new work on it. Everything this plan
  mirrors is present in canary.
- `origin` is HTTPS (`github.com/vercel/next.js`). There is also an `acdlite` SSH
  remote — if any git op fails with an SSH `publickey`/agent error, stop and ask the
  user to unlock their SSH key provider (per repo AGENTS.md); do not switch remotes.

## Scope (confirmed with the user)

- **In scope:** the *capability* to extract a shell from a static PPR per-segment
  prefetch — i.e. produce the per-segment boundary on the server and a decode path
  on the client.
- **Out of scope:** wiring the derived shell to any consumer. In particular, ignore
  the shell-restricted-navigation / navigation-testing-lock work
  (`shouldRestrictNavigationToShell`, `getShellSegmentVaryPath`) — that was a
  *separate* task this was split off from. We are not replacing the runtime shell
  render (`FetchStrategy.RuntimeShell`); we are adding a static-derived shell.
- **Chosen definition of "shell":** option **B — intra-segment byte prefix.** A
  segment's shell is that segment's own output with its param-dependent parts
  reduced to `Fallback`, expressed as a decodable *prefix* of the segment's
  serialized bytes. (The rejected alternative, option A, was whole-segment grain:
  "a segment is either entirely shell or not," reusing the existing `varyParams`
  signal. The user explicitly wants intra-segment prefixes — that is the point of
  this task.)

## Background: how the whole-route shell mechanism works (the thing to mirror)

Verified in canary. Symbol names are the reliable anchors (line numbers drift).

**Server** (`packages/next/src/server/app-render/app-render.tsx`):
- The page render is *staged* via `StagedRenderingController`
  (`packages/next/src/server/app-render/staged-rendering.ts`). Content serializes in
  temporal stage order: `ShellStatic` → `Static` → `Dynamic`, where the `Shell*`
  stages are the param-independent App Shell.
- `renderToNodeFlightStream` produces one source stream; it is wrapped in
  `ReplayableNodeStream` and two replay streams are taken — one is the actual
  response, the other is fed to `countShellAndStaticStageBytes`.
- `countShellAndStaticStageBytes` → `countStageBytesUntilAbortNode` iterates chunks
  and attributes each chunk's byte length to `stageController.currentStage` (and all
  later stages, since later stages include earlier). The stage is advanced in
  lockstep by `runInSequentialTasks(() => advanceStage(ShellStatic), () =>
  advanceStage(Static), ..., () => advanceStage(Dynamic))`.
- Cumulative bytes at end-of-`ShellStatic` resolve the response's **`a`** field;
  end-of-`Static` resolves **`l`**. `a` may resolve to `null`, meaning "shell ==
  full response" (no separate prefix).

**Client** (`packages/next/src/client/components/router-reducer/fetch-server-response.ts`):
- `resolveShellStageData(cacheData, flightResponse, headers)`: if `flightResponse.a`
  is a number, truncate `cacheData.shellBodyClone` at that byte offset and decode the
  prefix. `a === undefined` → server emitted nothing; `a === null` → shell == full.
- `resolveStaticStageData(...)` is the analogous helper for the `l` (static) boundary.
- Both call `decodeStageUntilBoundary(clone, byteLength, headers)`, which buffers the
  truncated clone (`createNonTaskyPrefetchResponseStream`) and decodes it with
  `createFromNextReadableStream(..., { allowPartialStream: true })`.
- The **clone** (`shellBodyClone` / `staticBodyClone`) is what makes it "rewindable":
  the same response bytes are decoded more than once, at different truncation points.
- Consumer example: `cache.ts` navigation path calls `resolveShellStageData` and,
  for a `RuntimeShell` prefetch, fulfills entries with the shell while also caching
  the full response.

Field type decls: `NavigationFlightResponse` / `InitialRSCPayload` in
`packages/next/src/shared/lib/app-router-types.ts` carry `a?: Promise<number | null>`
(shell byte length) and `l?: Promise<number>` (static byte length).

## The crux (why this is hard for segments)

`collect-segment-data.tsx` does **not** stage. Flow today:
1. `collectSegmentData(...)` (exported; called from `app-render.tsx` via
   `ComponentMod.collectSegmentData`) receives only the final whole-page Flight
   buffer `fullPageDataBuffer` (params already **concrete**), warms the module cache
   by decoding it once, then `prerender(<PrefetchTreeData .../>)` walks the route tree
   (`FlightRouterState` + `CacheNodeSeedData`) and spawns one task per segment.
2. `renderSegmentPrefetch(...)` builds a `SegmentPrefetchResponse`
   (`{ buildId, data: Array<SegmentPrefetch | null> }`, where
   `SegmentPrefetch = { rsc, isPartial, staleTime, varyParams }`), `prerender`s it to
   a single prelude stream, and drains it into **one `Buffer`** via `streamToBuffer`.
   The abort controller fires after `waitAtLeastOneReactRenderTask()` (one microtask);
   anything not yet emitted is dynamic and encoded as never-resolving references via
   `createUnclosingPrefetchStream`. `isPartial` is detected by a *separate*
   abort-on-microtask prerender in `isPartialRSCData`.
3. Results collected into `Map<SegmentRequestKey, Buffer>`, including special keys
   `/_tree`, `/_full`, `/_index`. Inlined ancestor segments are carried on a
   `SegmentBundleNode` linked list and flattened into `data[]` at serialization time.

Because the re-encode works from **decoded concrete data**, the shell/static layering
that the *source* render produced is already collapsed. A naive re-encode therefore
**cannot** yield a shell prefix — the prefix property is a product of React PPR staged
rendering of *source* components, not recoverable from decoded concrete values.
`collectSegmentData` also runs in **both build and edge runtimes**
(`process.env.NEXT_RUNTIME === 'edge'` is checked at its call site in `app-render.tsx`).

## Enabling insight

The **whole-page buffer already contains a shell prefix**: its first `a` bytes
(the page-level shell boundary) decode to a shell-form `InitialRSCPayload` in which
every segment's content is the `Fallback`/shell version. So if we pass the **page
shell byte length** into `collectSegmentData`, it can decode the page buffer **twice**:

- full buffer → concrete per-segment `rsc` (as today), and
- buffer truncated at page-`a` → shell-form per-segment `rsc` (params → `Fallback`).

Walking both decoded trees in parallel gives, per segment, both a `concreteRsc` and a
`shellRsc`, using only existing primitives (`streamFromBuffer` + `subarray`/truncation
+ `createFromReadableStream`).

The remaining open risk is re-emitting, **per segment**, a *single* Flight stream
whose first `a_seg` bytes decode to `shellRsc` and whose full bytes decode to
`concreteRsc`.

## Plan

### Phase 0 — de-risk the per-segment staged re-emission (DO THIS FIRST)

Prove out how to produce a segment stream with a shell prefix from the two decoded
trees. Nothing else should be built until this is settled, because it determines the
whole shape.

Candidate techniques, in order of preference:

1. **Staged segment re-encode.** Drive the segment `prerender` with a
   `StagedRenderingController` + replayable clone + `countShellAndStaticStageBytes`,
   using a wrapper node that yields `shellRsc` during `ShellStatic` and upgrades to
   `concreteRsc` during `Static` — analogous to the `useDeferredValue(dynamic,
   static)` override the segment cache already relies on. Record the `ShellStatic`
   byte length as `a_seg`.
   - Note the edge constraint: `ReplayableNodeStream` throws on edge. Segments are
     already `Buffer`s, so use buffer-based cloning, not a Node tee.
2. If (1) can't be driven from decoded data: compute per-segment boundaries **in the
   original staged page render** and carry them down (bigger change; see Phase 1
   open question), or — last resort — store the shell as a separate representation
   (diverges from the `a` byte-prefix pattern).

**Exit criteria:** a segment buffer where truncating at the recorded `a_seg` decodes
to `Fallback` params, and the full buffer decodes to concrete; `isPartial` detection
still correct. Prototype with a single simple dynamic-param route.

### Phase 1 — server plumbing (after Phase 0 picks a technique)

- Thread the **page shell byte length** into `collectSegmentData`.
  - OPEN: confirm it is available at the call site. The *streamed response* render
    computes it as `shellByteLengthDeferred` and attaches it as `a`. The
    prerender/build path that produces `fullPageDataBuffer` (feeding
    `collectSegmentData`) needs checking — it may already be computed and just needs
    passing through, or may need to be captured/stored. Since `a` is a byte offset
    *into the whole-page buffer* and `collectSegmentData` already has that buffer,
    passing the single number is sufficient (truncate + decode locally).
- Double-decode the page buffer (full + truncated-at-page-`a`). Walk the shell and
  concrete trees in parallel with the existing `FlightRouterState` / `CacheNodeSeedData`
  traversal in `PrefetchTreeData` → `collectSegmentDataImpl`.
- Carry `shellRsc` alongside `rsc` through the traversal **and** the `SegmentBundleNode`
  linked list — each inlined ancestor segment needs its own boundary.
- `renderSegmentPrefetch`: produce `a_seg` and add it to the serialized response.
  - Granularity decision: one boundary per `SegmentPrefetchResponse` vs one per
    `SegmentPrefetch` element in `data[]`. Bundles inline multiple segments into one
    response, so **per-element** is likely required.
- Preserve `isPartialRSCData` semantics and the `createUnclosingPrefetchStream` /
  abort-on-microtask behavior.
- Edge runtime: buffer-based cloning only.

### Phase 2 — client

- In `packages/next/src/client/components/segment-cache/cache.ts`, the segment fetch
  path decodes the response via
  `createFromNextReadableStream<SegmentPrefetchResponse>(..., { allowPartialStream: true })`.
  The response is already buffered, so add a segment-level shell decode mirroring
  `decodeStageUntilBoundary` (clone the segment body, truncate at `a_seg`, re-decode).
- Since no consumer is in scope, deliver the **capability**: the boundary field on the
  response + a decode path that yields the shell variant. Do not wire it into
  navigation/vary-path keying.

### Phase 3 — interactions / correctness

- `collectPrefetchHints` (build-time size-measurement pass) also calls
  `renderSegmentPrefetch` — make sure the added work doesn't break or skew size
  measurement.
- `/_tree`, `/_full`, `/_index` special keys: define their shell semantics or
  explicitly no-op them.
- Bundle inlining/flattening must preserve per-segment boundaries.

## Verification

- Types: `pnpm --filter=next types` (~10s).
- Build core: `pnpm --filter=next build`. Full `pnpm build-all` after branch switch /
  bootstrap or if Rust/Turbopack is touched. Start `pnpm --filter=next dev` (watch)
  before iterating.
- e2e must run under cache-components (PPR codepaths):
  `__NEXT_CACHE_COMPONENTS=true`. Generate any new test with
  `pnpm new-test -- --args true <name> e2e` (mandatory).
- Targeted unit-style assertions: truncating a segment buffer at `a_seg` decodes to
  `Fallback` params; full buffer decodes to concrete; `isPartial` unchanged.
- Capture test output to a file once and analyze; don't re-run with different greps.
- NOTE on the user's `nxt` wrapper (Next.js framework dev only): use `nxt` for
  test/build, never prefix with env vars, never pipe/redirect; use `--tee <file>` to
  capture. E.g. `nxt test-start-turbo <path> --tee /tmp/out.log`.

## Open questions to resolve while implementing

1. Phase 0 technique feasibility — can a staged re-encode of decoded data emit a
   valid shell-prefix stream? (The crux.)
2. Is the page shell byte length already available at the `collectSegmentData` call
   site for the prerender/build path, or must it be captured/stored?
3. Boundary granularity: one `a` per `SegmentPrefetchResponse` vs per `SegmentPrefetch`
   element (bundles argue for per-element).
4. Client: derive the shell on demand vs eagerly; where to hold it given no consumer
   is in scope.

## Key code anchors (symbol names; grep these)

- `packages/next/src/server/app-render/collect-segment-data.tsx`:
  `collectSegmentData`, `PrefetchTreeData`, `collectSegmentDataImpl`,
  `renderSegmentPrefetch`, `isPartialRSCData`, `createUnclosingPrefetchStream`,
  types `SegmentPrefetchResponse` / `SegmentPrefetch`, `SegmentBundleNode`,
  keys `/_tree` `/_full` `/_index`.
- `packages/next/src/server/app-render/app-render.tsx`:
  `collectSegmentData` wrapper + `ComponentMod.collectSegmentData` call site,
  `countShellAndStaticStageBytes`, `countStageBytesUntilAbortNode`,
  `runInSequentialTasks`, `shellByteLengthDeferred`, `renderToNodeFlightStream`.
- `packages/next/src/server/app-render/staged-rendering.ts`:
  `StagedRenderingController`, `RenderStage`, `RENDER_STAGE_ADVANCE_ORDER`.
- `packages/next/src/client/components/router-reducer/fetch-server-response.ts`:
  `resolveShellStageData`, `resolveStaticStageData`, `decodeStageUntilBoundary`.
- `packages/next/src/server/app-render/app-render-prerender-utils.ts`:
  `ReplayableNodeStream` / `createReplayStream` (throws on edge — do not use there).
- `packages/next/src/server/stream-utils/node-web-streams-helper.ts`:
  `streamFromBuffer`, `streamToBuffer`.
- `packages/next/src/shared/lib/app-router-types.ts`: `a` / `l` field decls.

## Constraints / gotchas

- `collect-segment-data.tsx` runs inside `prerender` with abort-on-microtask. Do NOT
  introduce real async work into the hot path after `onCompletedProcessingRouteTree()`
  — it will be treated as a dynamic-data hang.
- Edge runtime can't tee/replay Node Readables (`ReplayableNodeStream` throws).
  Account for both runtimes; segments are already `Buffer`s so prefer buffer clones.
- This file is bundled by the user's bundler via `entry-base.ts`; require internal
  modules only through `entryBase.*` exports, not relative `require()`. It uses
  vendored `react-server-dom-webpack/{static,client}` imports (see `$react-vendoring`).
- Do not break `isPartial` detection or the `collectPrefetchHints` size pass.
- Cache-components enables PPR by default; test with `__NEXT_CACHE_COMPONENTS=true`
  rather than the mostly-skipped dedicated `ppr/` suites.

## Suggested first steps for the implementing session

1. Read `renderSegmentPrefetch` and `PrefetchTreeData`/`collectSegmentDataImpl` end to
   end in `collect-segment-data.tsx`.
2. Read `resolveShellStageData` + `decodeStageUntilBoundary` and the staged-render
   byte-counting (`countShellAndStaticStageBytes`) to internalize the pattern.
3. Start Phase 0 as a throwaway spike on one dynamic-param route: get `shellRsc` +
   `concreteRsc` per segment (double-decode via page `a`), then try technique (1) and
   check the exit criteria before building anything durable.
