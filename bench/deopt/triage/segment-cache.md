# Deopt triage: segment-cache

Tool: `pnpm bench:deopt --scenario segment-cache` (see bench/deopt/README.md)
Workflow: `$deopt-triage` (.agents/skills/deopt-triage/SKILL.md)

Seeded 2026-07-24 from three runs (95 stable finding lines, 94 present in
all three). Grouped by suspected root cause; hypotheses are unverified until
a task moves to `investigating`.

## Task: route-cache-entry hidden-class fork (hasDynamicRewrite)

- status: fixed — #96164 merged; verified in the combined post-merge run
  (2026-07-24)
- severity: high
- updated: 2026-07-24 PR opened; 20 findings cleared in the PR's
  before/after run; absorbed the former "optimistic route-part matching"
  task (same root cause)

Investigated (2026-07-24, two independent agents converged): the
status-variant hypothesis was close but the actual fork is
`hasDynamicRewrite`. RouteCacheEntry has 3 hidden classes: (A) the pending
literal in `createDetachedRouteCacheEntry` (cache.ts:627, 12 props, no
`hasDynamicRewrite`); (B) A + the field appended POST-construction by
`fulfillRouteCacheEntry` (cache.ts:1302) — a shape transition that also
deprecates map A; (C) the two fulfilled literals that declare the field in
8th position (cache.ts:780, optimistic-routes.ts:674). Readers mixing
pending/fulfilled/synthetic entries (navigation.ts, scheduler.ts,
optimistic-routes.ts incl. `matchKnownRoutePart`, and `isValueExpired` in
cache-map.ts) see 2–3 maps; the wrong-map eager deopts follow.
SegmentCacheEntry is already clean (single factory, transitions overwrite
declared fields only). No code depends on field absence (verified: no
in-checks/Object.keys/delete). Fix dispatched: add `hasDynamicRewrite:
false` to `createDetachedRouteCacheEntry` in the literals' key position +
lift the field into the shared type. Expected residual: cache-map.ts
`value`-protocol sites (ref/size/staleAt/version) stay 3-typed
(route/segment/bfcache is by design — see cache-map task).

Fix-agent verification (2026-07-24, forced-rebuild before/after + stability
re-run): the `hasDynamicRewrite` polymorphic signatures cleared and ~24
entry-field polymorphic IC lines cleared (all 5 navigation.ts `v` lines, 6
optimistic-routes.ts `g` lines, 8 scheduler.ts lines, cache.ts
canonicalUrl); both targeted e2e suites green; types pass. Residuals,
reattributed: `isValueExpired` wrong-map + the cache-map `staleAt`/`version`
reads are the by-design 3-typed MapValue union (moved to the cache-map
task). The matchKnownRoutePart wrong-map survives at 1× but moved to the
`hasDynamicRewrite` read (791:26) — analysis: a ONE-TIME map-deprecation
deopt caused by `fulfillRouteCacheEntry` mutating null-initialized fields in
place (first fulfillment generalizes field types, deprecating the initial
map). Eliminating it would mean fulfilling via fresh literals instead of
in-place mutation.
Decision (2026-07-24): maintainer green-lit the fresh-literal fulfillment
follow-up — investigate identity-swap safety (every holder of a pending
entry reference must observe the swap) and implement if contained. (Note: a
constructor function would NOT help — the deopt is null→value
field-representation generalization, which applies to constructor instances
identically; it fires once per isolate.)
Follow-up outcome (2026-07-24): audit found containment and a fix was
implemented and verified (draft PR #96174), but the maintainer CLOSED it
after cost/benefit review: the deopt is a one-time-per-isolate warmup
event with an effectively monomorphic steady state after re-optimization,
while the fix requires a permanent identity-swap invariant (entry object
identity changes at fulfillment). Shape benefits overlap #96164. Status:
accepted — the closed PR holds the identity-swap audit and raw-log
analysis as reference if fulfillment deopts ever recur as a non-warmup
event.

Findings:

```

```

(6 lines on `requestKey`/`refreshState`/`varyPath` were re-homed to the
reifyRouteTree task — those are RouteTree-node fields, cleared by the
key-order fix, misassigned here by the seed grouping.)

Resolved (cleared in PR #96169's runs — the 794:25 instance was the
packed/holey slice deopt; the 791:26 map-deprecation instance did not
reproduce in two after-runs, so the fresh-literal fulfillment follow-up
may be unnecessary — pending its agent's audit):

```
high  deopt-eager  packages/next/src/client/components/segment-cache/optimistic-routes.ts  matchKnownRoutePart  wrong map
info  deopt-lazy  packages/next/src/client/components/segment-cache/optimistic-routes.ts  matchKnownRoutePart  (unknown)
# (lines below cleared earlier in PR #96164's run)
info  ic-polymorphic  packages/next/src/client/components/segment-cache/cache.ts  eg  keys: canonicalUrl
info  ic-polymorphic  packages/next/src/client/components/segment-cache/navigation.ts  v  keys: canonicalUrl
info  ic-polymorphic  packages/next/src/client/components/segment-cache/navigation.ts  v  keys: metadata
info  ic-polymorphic  packages/next/src/client/components/segment-cache/navigation.ts  v  keys: renderedSearch
info  ic-polymorphic  packages/next/src/client/components/segment-cache/navigation.ts  v  keys: status
info  ic-polymorphic  packages/next/src/client/components/segment-cache/navigation.ts  v  keys: tree
info  ic-polymorphic  packages/next/src/client/components/segment-cache/optimistic-routes.ts  g  keys: size
info  ic-polymorphic  packages/next/src/client/components/segment-cache/optimistic-routes.ts  g  keys: staleAt
info  ic-polymorphic  packages/next/src/client/components/segment-cache/optimistic-routes.ts  g  keys: supportsPerSegmentPrefetching
info  ic-polymorphic  packages/next/src/client/components/segment-cache/optimistic-routes.ts  g  keys: tree
info  ic-polymorphic  packages/next/src/client/components/segment-cache/optimistic-routes.ts  g  keys: version
info  ic-polymorphic  packages/next/src/client/components/segment-cache/scheduler.ts  <anonymous>  keys: status
info  ic-polymorphic  packages/next/src/client/components/segment-cache/scheduler.ts  <anonymous>  keys: supportsPerSegmentPrefetching
info  ic-polymorphic  packages/next/src/client/components/segment-cache/scheduler.ts  <anonymous>  keys: tree
info  ic-polymorphic  packages/next/src/client/components/segment-cache/scheduler.ts  F  keys: metadata, tree
info  ic-polymorphic  packages/next/src/client/components/segment-cache/scheduler.ts  I  keys: metadata
info  ic-polymorphic  packages/next/src/client/components/segment-cache/scheduler.ts  L  keys: renderedSearch
info  ic-polymorphic  packages/next/src/client/components/segment-cache/scheduler.ts  j  keys: status
info  ic-polymorphic  packages/next/src/client/components/segment-cache/scheduler.ts  j  keys: tree
info  ic-polymorphic  packages/next/src/client/components/segment-cache/optimistic-routes.ts  e  keys: hasDynamicRewrite
info  ic-polymorphic  packages/next/src/client/components/segment-cache/optimistic-routes.ts  g  keys: couldBeIntercepted
```

## Task: route-tree node key-order divergence in reifyRouteTree

- status: fixed — #96162 merged; verified in the combined post-merge run
  (2026-07-24)
- severity: high
- updated: 2026-07-24 PR opened; 20 of 22 findings cleared in the PR's
  forced-rebuild before/after run; residual pair below is one-time
  map-deprecation mechanics (field-type generalization), info-class

Investigated (2026-07-24): every RouteTree constructor in cache.ts writes
keys in the order `requestKey, segment, shellVaryPath, refreshState,
varyPath, isPage, slots, prefetchHints` (cache.ts:832, :848, :1251, :1571,
:1757), but the two literals in `reifyRouteTree` (optimistic-routes.ts:953,
:970) use `..., refreshState, slots, prefetchHints, isPage, varyPath` —
same 8 keys, different insertion order → two disjoint hidden-class
families. They mix at shared read sites (matchKnownRoute stores reified
synthetic entries back as patterns at optimistic-routes.ts:690; scheduler
and ppr-navigations walk both), explaining the polymorphic RouteTree-field
ICs and the `wrong map` eager deopts in `reifyRouteTree` and
`pingSharedPartOfCacheComponentsTree`. Fix: reorder the two reify literals
to match cache.ts — behavior-neutral (nothing iterates node keys; only
`slots` is iterated). Secondary 1×-only contributors (not fixed, likely
noise): FlightRouterState tuple map variance at scheduler.ts:1058,
resolvedParams array variance at optimistic-routes.ts:904, one-time field
type generalization (segment string|tuple, varyPath layout|page).

Fix-agent verification (2026-07-24, valid forced-rebuild before/after):
22 polymorphic IC lines cleared (optimistic-routes 6, scheduler 10, cache 4,
vary-path 2); behavior-neutral; types pass. IMPORTANT reattribution: the two
`wrong map` eager deopts did NOT clear and turned out to be different object
families at the same functions — optimistic-routes.ts:904:19 is
`newValue.join('/')` on resolved-param values (string vs string[] receiver;
moved to the string/array receivers task) and scheduler.ts:1058:33 is
`oldTree[1]` on FlightRouterState tuples (moved to the tuple task).

Findings:

```
info  deopt-dependency-change  packages/next/src/client/components/segment-cache/optimistic-routes.ts  reifyRouteTree  dependent field type constness changed
info  deopt-lazy  packages/next/src/client/components/segment-cache/optimistic-routes.ts  reifyRouteTree  (unknown)
```

Resolved (cleared in PR #96162's forced-rebuild before/after run; the last
6 lines are RouteTree-field reads re-homed from the route-cache-entry task,
which PR #96164's run showed its fix does not clear — this one does):

```
info  ic-polymorphic  packages/next/src/client/components/segment-cache/optimistic-routes.ts  e  keys: isPage
info  ic-polymorphic  packages/next/src/client/components/segment-cache/optimistic-routes.ts  e  keys: prefetchHints
info  ic-polymorphic  packages/next/src/client/components/segment-cache/optimistic-routes.ts  e  keys: segment
info  ic-polymorphic  packages/next/src/client/components/segment-cache/optimistic-routes.ts  e  keys: slots
info  ic-polymorphic  packages/next/src/client/components/segment-cache/scheduler.ts  <anonymous>  keys: prefetchHints
info  ic-polymorphic  packages/next/src/client/components/segment-cache/scheduler.ts  F  keys: prefetchHints
info  ic-polymorphic  packages/next/src/client/components/segment-cache/scheduler.ts  M  keys: prefetchHints
info  ic-polymorphic  packages/next/src/client/components/segment-cache/scheduler.ts  M  keys: segment, 0
info  ic-polymorphic  packages/next/src/client/components/segment-cache/scheduler.ts  M  keys: slots
info  ic-polymorphic  packages/next/src/client/components/segment-cache/scheduler.ts  e  keys: prefetchHints
info  ic-polymorphic  packages/next/src/client/components/segment-cache/scheduler.ts  e  keys: segment
info  ic-polymorphic  packages/next/src/client/components/segment-cache/scheduler.ts  e  keys: segment, 0
info  ic-polymorphic  packages/next/src/client/components/segment-cache/scheduler.ts  e  keys: slots
info  ic-polymorphic  packages/next/src/client/components/segment-cache/scheduler.ts  j  keys: prefetchHints
info  ic-polymorphic  packages/next/src/client/components/segment-cache/cache.ts  e_  keys: varyPath
info  ic-polymorphic  packages/next/src/client/components/segment-cache/cache.ts  eg  keys: requestKey
info  ic-polymorphic  packages/next/src/client/components/segment-cache/cache.ts  q  keys: varyPath
info  ic-polymorphic  packages/next/src/client/components/segment-cache/optimistic-routes.ts  e  keys: refreshState
info  ic-polymorphic  packages/next/src/client/components/segment-cache/optimistic-routes.ts  e  keys: requestKey
info  ic-polymorphic  packages/next/src/client/components/segment-cache/scheduler.ts  M  keys: requestKey
```

## Task: route-tree slots megamorphic keyed store

- status: fixed — #96168 merged; verified in the combined post-merge run
  (2026-07-24); one expected new info line below (one-time Map prototype
  dependency-change during warmup)
- severity: high
- updated: 2026-07-24 PR opened; required megamorphic line cleared in the
  PR before/after run; tests green (basic 10, parallel-slot 1,
  cached-navigations 16); NOTE: a pre-existing keyed load on the
  wire-format FlightRouterState[1] children object surfaced as a NEW
  megamorphic line at scheduler.ts:1068 once slot iteration changed (was
  previously on the for-in enum-cache fast path) — re-homed to the
  FlightRouterState task
- decision: maintainer approved option 1 — convert `RouteTree.slots` to
  `Map<string, RouteTree>` (~20 touch points; `CacheNode.slots` stays a
  plain object). Queued for the next fix wave.

Root cause (investigated 2026-07-24): all `RouteTree.slots` objects are
plain objects built by incremental assignment with dynamic keys — the
parallel-route slot names (`children`, `side`, …). Construction sites:
cache.ts:1458/1531 (`convertTreePrefetchToRouteTree`), cache.ts:818/821,
cache.ts:1748–1753, optimistic-routes.ts:926/928. Every key-set/insertion
order is a distinct hidden-class transition, so the keyed store at
cache.ts:1531 is megamorphic. This is inherent to plain-object storage with
app-defined keys, not a bug in any one site.

Options:

1. `Map<string, RouteTree>` for slots — makes access monomorphic. ~20 touch
   points across cache.ts, optimistic-routes.ts, scheduler.ts,
   ppr-navigations.ts, is-navigating-to-new-root-layout.ts (RouteTree is
   in-memory only; wire formats TreePrefetch/FlightRouterState unaffected;
   `CacheNode.slots` must STAY a plain object — spread into JSX props).
2. Accept it: the store is on the route-tree conversion path (once per
   response), not a per-frame loop; slots have 1–2 entries typically.
3. Null-prototype objects: does NOT fix keyed-IC megamorphism; rejected.

Recommendation: option 2 (accept), revisit option 1 only if a CPU profile
shows slot access hot. Maintainer decision requested.

Findings:

```
info  deopt-dependency-change  packages/next/src/client/components/segment-cache/scheduler.ts  pingSharedPartOfCacheComponentsTree  dependent prototype chain changed
```

Resolved (cleared in PR #96168's before/after run):

```
high  ic-megamorphic  packages/next/src/client/components/segment-cache/cache.ts  e  keys: children, side
```

## Task: cache-map / LRU internal node shapes

- status: accepted
- severity: high
- updated: 2026-07-24 maintainer accepted both recommendations
- decision: ACCEPT the 3-typed MapValue union (route/segment/bfcache at a
  generic container — stable, under the megamorphic threshold) and ACCEPT
  the `getEntryWithFallbackImpl` cold-branch warmup one-shots. Findings
  below stay listed as accepted; revisit only if a profile implicates them.
  (The VaryPath portion was fixed separately — see Resolved and #96122.)

Investigated (2026-07-24): three distinct structures, only one fixable.
(1) `MapEntry` tree/LRU nodes are ALREADY monomorphic — two construction
sites with identical key order (cache-map.ts:147, :211); lru.ts only
mutates pre-declared fields. Not the problem. (2) The `value`/`parent`
polymorphism at cache-map.ts ~178/179/322/323 is VaryPath key-node chains —
covered by the vary-path fix (see vary-path task; one PR fixes both).
(3) The `ref`/`size`/`staleAt`/`version` polymorphism is the `MapValue`
protocol being implemented by three types by design (RouteCacheEntry,
SegmentCacheEntry, BFCacheEntry) — after the route-entry fix this settles
at exactly 3 stable shapes, under V8's megamorphic threshold.
Recommendation: ACCEPT the residual 3-type polymorphism (making it
monomorphic needs per-type helper duplication or a boxed header — invasive,
unjustified). The `getEntryWithFallbackImpl` eager deopts are cold-branch
warmup one-shots (first cache expiry / first navigation read hit branches
compiled without feedback); they don't recur — recommend ACCEPT as
documented warmup noise. Maintainer sign-off requested for both accepts.

Findings:

```
high  deopt-eager  packages/next/src/client/components/segment-cache/cache-map.ts  isValueExpired  wrong map
info  ic-polymorphic  packages/next/src/client/components/segment-cache/cache-map.ts  d  keys: staleAt
info  ic-polymorphic  packages/next/src/client/components/segment-cache/cache-map.ts  d  keys: version
info  deopt-eager  packages/next/src/client/components/segment-cache/cache-map.ts  getEntryWithFallbackImpl  Insufficient type feedback for call
info  deopt-eager  packages/next/src/client/components/segment-cache/cache-map.ts  getEntryWithFallbackImpl  Insufficient type feedback for generic named access
info  deopt-lazy  packages/next/src/client/components/segment-cache/cache-map.ts  getEntryWithFallbackImpl  (unknown)
info  ic-polymorphic  packages/next/src/client/components/segment-cache/cache-map.ts  _  keys: ref
info  ic-polymorphic  packages/next/src/client/components/segment-cache/cache-map.ts  _  keys: size
info  ic-polymorphic  packages/next/src/client/components/segment-cache/cache-map.ts  h  keys: size
info  ic-polymorphic  packages/next/src/client/components/segment-cache/cache-map.ts  p  keys: ref
info  ic-polymorphic  packages/next/src/client/components/segment-cache/cache-map.ts  p  keys: size
```

Resolved (VaryPath chain-walk reads, cleared in the vary-path fix's
forced-rebuild before/after run — branch deopt-fix-vary-path-shape):

```
info  ic-polymorphic  packages/next/src/client/components/segment-cache/cache-map.ts  <anonymous>  keys: parent
info  ic-polymorphic  packages/next/src/client/components/segment-cache/cache-map.ts  <anonymous>  keys: value
info  ic-polymorphic  packages/next/src/client/components/segment-cache/cache-map.ts  e  keys: parent
info  ic-polymorphic  packages/next/src/client/components/segment-cache/cache-map.ts  e  keys: value
```

## Task: FlightRouterState tuple element accesses

- status: investigating (fix agent running — packed-clone fix)
- decision (2026-07-24): wire-format-inherent residuals (numeric-key TYPE
  polymorphism in convertFlightRouterStateToRouteTree; megamorphic
  children-object keyed load at scheduler.ts:1068) are DEFERRED, not
  accepted — FlightRouterState is a known refactor target with wider
  implications, and these findings should feed that design. Only the
  packed-clone fix (wire-compatible) proceeds now.
- updated: 2026-07-24 investigated; mechanical fix dispatched. Root cause:
  clone sites build length-2 literals then write index 3/4 past the length,
  creating HOLEY arrays; flight-deserialized tuples are PACKED (wire sends
  explicit $undefined placeholders), so consumers mix both maps — the
  pingSharedPartOfCacheComponentsTree wrong-map fires when the current tree
  flips provenance after the first navigation patch. Fix: full-length
  literals in convertServerPatchToFullTreeImpl,
  patchRouterStateWithNewChildren, stripClientOnlyDataFromFlightRouterState
  (wire output byte-identical). Residual by design: numeric-key type
  polymorphism in convertFlightRouterStateToRouteTree (mixed element TYPES
  in wire tuples) and the server-side loader-tree construction (server JIT,
  possible follow-up).
- note: PR #96168 (slots Map refactor) surfaced a NEW stable megamorphic
  keyed load on the wire-format FlightRouterState[1] children object at
  scheduler.ts:1068 (pre-existing access, formerly on the for-in
  enum-cache fast path):
  `high ic-megamorphic scheduler.ts e keys: children, side` — include in
  this task s scope.
- severity: high
- updated: 2026-07-24 absorbed the pingSharedPartOfCacheComponentsTree
  wrong-map deopt (reattributed from the route-tree task: the deopt site is
  `oldTree[1]`, a tuple element load, confirmed unaffected by the RouteTree
  key-order fix)

Hypothesis: `FlightRouterState` is an array-as-tuple; polymorphic accesses
on indices `0`–`4` mean the tuple arrays have mixed maps (element-kind
transitions — e.g. PACKED_ELEMENTS vs holey, or tuples of different length
when optional trailing elements are omitted; arrays also arrive from two
provenances — flight-deserialized vs locally constructed by
`convertRouteTreeToFlightRouterState`). Fix candidates: always construct
full-length, fully packed tuples with consistent element kinds, or accept.

Findings:

```
high  ic-megamorphic  packages/next/src/client/components/segment-cache/scheduler.ts  e  keys: children, side
high  deopt-eager  packages/next/src/client/components/segment-cache/scheduler.ts  pingSharedPartOfCacheComponentsTree  wrong map
info  ic-polymorphic  packages/next/src/client/components/segment-cache/cache.ts  ed  keys: 0
info  ic-polymorphic  packages/next/src/client/components/segment-cache/cache.ts  ed  keys: 1
info  ic-polymorphic  packages/next/src/client/components/segment-cache/cache.ts  ed  keys: 2
info  ic-polymorphic  packages/next/src/client/components/segment-cache/cache.ts  ed  keys: 4
info  ic-polymorphic  packages/next/src/client/components/segment-cache/cache.ts  ed  keys: 4, prefetchHints
info  ic-polymorphic  packages/next/src/client/components/segment-cache/navigation.ts  e  keys: 0
info  ic-polymorphic  packages/next/src/client/components/segment-cache/navigation.ts  e  keys: 1
info  ic-polymorphic  packages/next/src/client/components/segment-cache/navigation.ts  e  keys: 2
info  ic-polymorphic  packages/next/src/client/components/segment-cache/navigation.ts  e  keys: 3
info  ic-polymorphic  packages/next/src/client/components/segment-cache/navigation.ts  e  keys: 4
info  ic-polymorphic  packages/next/src/client/components/segment-cache/optimistic-routes.ts  e  keys: 0
info  ic-polymorphic  packages/next/src/client/components/segment-cache/optimistic-routes.ts  y  keys: 0
```

Resolved:

```

```

## Task: vary-path param-node shapes

- status: fixed — landed on canary independently as
  https://github.com/vercel/next.js/pull/96122 ("Keep VaryPath monomorphic
  by making isRootParam required"), functionally identical to our verified
  fix (diff vs our commit is comment wording only). Our redundant branch was
  not submitted; the GitHub 500s blocking its PR are moot. Confirm cleared
  lines in the next run against latest canary.
- severity: info
- updated: 2026-07-24 fix verified locally (before/after + tests), then
  found already fixed upstream by #96122

Root cause (investigated 2026-07-24): `isRootParam` is optional on VaryPath
nodes (vary-path.ts:47); constructors split into 3-prop
`{id, value, parent}` (vary-path.ts:109, :134, :169, :191, :240, :309,
:334) and 4-prop `{id, value, isRootParam, parent}` (:156, :368, :394)
shapes, and a single chain interleaves both (finalize nodes vs param
nodes), so every traversal is polymorphic — including the chain walks in
cache-map.ts (see cache-map task). Fix dispatched: required
`isRootParam: boolean`, `isRootParam: false` added to all 3-prop literals
in consistent key position, opaque type declarations updated. Note: the
`varyPath`/`isPage` lines in this task read RouteTree nodes, not VaryPath
nodes — they belong to the reifyRouteTree key-order fix and are expected to
clear there.

Findings:

```
info  ic-polymorphic  packages/next/src/client/components/segment-cache/vary-path.ts  g  keys: isPage
info  ic-polymorphic  packages/next/src/client/components/segment-cache/vary-path.ts  g  keys: varyPath
```

(the two remaining lines are RouteTree-node reads; PR #96162's run clears
them — expected to move to Resolved after the combined verification run.)

Resolved (cleared in the vary-path fix's forced-rebuild before/after run;
tests: vary-params 17/17, prefetch-app-shell 18/18,
root-params-segment-prefetch 1/1):

```
info  ic-polymorphic  packages/next/src/client/components/segment-cache/vary-path.ts  e  keys: id
info  ic-polymorphic  packages/next/src/client/components/segment-cache/vary-path.ts  e  keys: isRootParam
info  ic-polymorphic  packages/next/src/client/components/segment-cache/vary-path.ts  e  keys: parent
info  ic-polymorphic  packages/next/src/client/components/segment-cache/vary-path.ts  e  keys: value
```

## Task: string/array method receivers

- status: fixed — #96169 merged; verified in the combined post-merge run
  (2026-07-24). Residual clusters ACCEPTED by maintainer: string
  representations (now including the three expected ICs inside the new
  splitter helper in cache-key.ts, listed below), RSC iterator shapes
  (defer to the cache.ts:3441 buffering TODO)
- severity: high
- updated: 2026-07-24 investigated with V8-map-level evidence from the raw
  log; mechanical fix dispatched

Investigated (2026-07-24), four clusters:

1. MECHANICAL (fix dispatched): the reifyRouteTree wrong-map at 904:19 is
   NOT string-vs-array — it is HOLEY vs PACKED elements-kind instability on
   arrays flowing from `split('/').filter(...)` through `slice`/`join`
   (split's output alternates kinds; filter/slice propagate). Also caused
   the matchKnownRoutePart wrong-map instance at 794:25 (inlined slice).
   Fix: (a) normalize the file-private `ResolvedParams` to
   `Map<string, string>` — join at the set() boundary (the system already
   models catch-all keys as joined strings, see cache.ts:1672); (b) shared
   packed splitter helper replacing split+filter at optimistic-routes.ts
   214/612 and cache.ts 1419.
2. ACCEPT (recommended): string-representation polymorphism (`endsWith` at
   cache.ts:1686 etc. — external/thin/internalized/cons one-byte strings
   from mixed provenance; V8-inherent, cheap, no deopts attributed).
3. ACCEPT (recommended): iterator `done`/`value` at cache.ts:3458
   (`getStaleAt`, `for await` over an RSC-deserialized AsyncIterable —
   result-object shapes originate in react-server-dom, one already
   dictionary-mode; cold path, once per prefetch response). The existing
   buffering TODO at cache.ts:3441 is the only realistic shape change and
   is correctness-motivated, not IC-motivated.
4. ACCEPT (recommended): FlightRouterState tuple-index polymorphism in
   `convertFlightRouterStateToRouteTree` — wire-format tuples with mixed
   element types; changing it is a protocol design question. (Overlaps the
   FlightRouterState task; reconcile with its investigation report.)
   The transient `eR keys: push` line was outside the segment-cache filter
   scope, 1×, null map — noise, dropped from watch.

Findings:

```
info  ic-polymorphic  packages/next/src/client/components/segment-cache/cache-key.ts  u  keys: charCodeAt
info  ic-polymorphic  packages/next/src/client/components/segment-cache/cache-key.ts  u  keys: length
info  ic-polymorphic  packages/next/src/client/components/segment-cache/cache-key.ts  u  keys: slice
info  ic-polymorphic  packages/next/src/client/components/segment-cache/cache.ts  eA  keys: done, value
info  ic-polymorphic  packages/next/src/client/components/segment-cache/cache.ts  ed  keys: endsWith
```

Resolved (cleared in PR #96169's before/after runs; the new helper adds
three expected info-level string-receiver ICs in cache-key.ts):

```
high  deopt-eager  packages/next/src/client/components/segment-cache/optimistic-routes.ts  reifyRouteTree  wrong map
info  ic-polymorphic  packages/next/src/client/components/segment-cache/cache.ts  eh  keys: filter
info  ic-polymorphic  packages/next/src/client/components/segment-cache/cache.ts  eh  keys: split
info  ic-polymorphic  packages/next/src/client/components/segment-cache/optimistic-routes.ts  e  keys: join
info  ic-polymorphic  packages/next/src/client/components/segment-cache/optimistic-routes.ts  e  keys: length
info  ic-polymorphic  packages/next/src/client/components/segment-cache/optimistic-routes.ts  e  keys: slice
info  ic-polymorphic  packages/next/src/client/components/segment-cache/optimistic-routes.ts  g  keys: filter
info  ic-polymorphic  packages/next/src/client/components/segment-cache/optimistic-routes.ts  g  keys: split
info  ic-polymorphic  packages/next/src/client/components/segment-cache/optimistic-routes.ts  h  keys: split
info  ic-polymorphic  packages/next/src/client/components/segment-cache/optimistic-routes.ts  y  keys: length
```

## Task: scheduler warmup-timing deopts

- status: accepted (maintainer sign-off 2026-07-24; warmup/tiering-timing
  class, reporter already classifies as info)
- severity: info
- updated: 2026-07-24 seeded

`Insufficient type feedback` eager deopts in `heapResift` and
`isPrefetchTaskDirty` (the latter appears in only 2 of 3 runs — this is the
one unstable finding), plus a `dependent field type constness changed` in
`compareQueuePriority`. All consistent with warmup/tiering timing rather
than shape hazards. Default expectation: `accepted` after confirming they
don't recur within a longer steady-state workload.

Findings:

```
info  deopt-eager  packages/next/src/client/components/segment-cache/scheduler.ts  heapResift  Insufficient type feedback for binary operation
info  deopt-eager  packages/next/src/client/components/segment-cache/scheduler.ts  isPrefetchTaskDirty  Insufficient type feedback for generic named access
info  deopt-dependency-change  packages/next/src/client/components/segment-cache/scheduler.ts  compareQueuePriority  dependent field type constness changed
```

Resolved:

```

```
