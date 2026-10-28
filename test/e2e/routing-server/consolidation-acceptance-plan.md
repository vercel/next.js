# Consolidation acceptance tests still to add

The companion suite tests existing behavior. This document separates tests blocked on a new implementation contract from additional coverage possible with today's APIs. There are no placeholder skipped tests for future APIs. See [consolidation-review.md](./consolidation-review.md) for executed coverage.

## A: compiler-owned development inventory

### Source filename transport: requires the Rust/N-API/TypeScript field

Agree on the field name and path representation first. Proposed contract: paths relative to the project directory, `/` separators after normalization, preserving actual filename case and custom extensions. A source path must identify a real file; neither URL paths nor emitted bundle paths qualify. Agree whether synthetic entries expose no source, a separate origin tag, or a framework source; never assign them a user page filename.

Extend the existing `next-rs-api` subscription fixture with a separate `src/` project using `pageExtensions: ['page.tsx', 'api.ts']`. Before any `writeToDisk` or explicit endpoint compilation, compare the complete source mapping for:

- Pages `/` → `src/pages/index.page.tsx`; dynamic `/article/[slug]` → `src/pages/article/[slug].page.tsx`; Pages API → `src/pages/api/echo.api.ts`.
- Grouped App page → `src/app/(marketing)/about/page.page.tsx` and Route Handler → `src/app/echo/route.api.ts`.
- One public `/parallel` with the exact three original identities and distinct files for `page.page.tsx`, `@left/page.page.tsx`, and `@right/page.page.tsx`.
- Static `icon.svg` and dynamic `sitemap.api.ts`, checking actual input files rather than their public metadata URLs or generated wrappers.
- Synthetic App not-found and Pages App/Document/Error endpoints according to the agreed synthetic-source contract.

Rename an ordinary source from `.page.tsx` to another configured extension while retaining its URL. Await the next subscription snapshot and assert the old source disappears, the new source appears exactly once, original identities remain correct, and no endpoint compilation was required. Repeat with root-level `pages/`/`app/` in the existing fixture. A new native field requires a native build and rebuilt JS outputs before claiming transport verification; an older published binary cannot establish this result.

### Snapshot installation: requires a real install/readiness boundary

The current `next-head` barrier tests initial Watchpack readiness. It cannot prove compiler snapshot independence. When the compiler subscription and atomic install operation exist, introduce a narrow integration harness around the real subscription consumer, with a controllable async iterable and compiler-ready barrier owned by the test. Do not add a production-only delay environment variable.

1. Hold the first compiler snapshot. Start a request for a known fixture destination and observe request arrival. Assert that response commitment is forbidden until installation is released; then require 200 and the destination marker.
2. Install generation 1 containing `/old`. Deliver an issues-only update without a routes payload. `/old` must remain reachable; diagnostics may change independently.
3. Deliver a valid empty routes map. `/old` must become 404, ordinary Pages/data inventory must be empty, and synthetic error handling must still work. An empty map must not be mistaken for a missing map.
4. Hold generation 2 between compiler readiness and publication, with `/new` replacing `/old`. Start a bounded batch of direct/data requests and browser navigation. Release publication; require completion without hangs, stale endpoint lookup, or mixed-generation failures. Each completed request must reflect one valid generation. Count outcomes, not internal method calls.
5. Capture the browser's route notification, start navigation as soon as it arrives, and require a compilable destination without a missing-endpoint error. Notifications cannot announce routes before their compiler generation is usable.
6. Independently hold the Next watcher's route-publication callback while allowing its other work to run. Release a compiler snapshot adding a route; Turbopack must serve it before the watcher route publication is released. Run the analogous Webpack fixture with the inverse expectation: watcher publication supplies its inventory. Do not disable the watcher or assert scan counts.

Production and adapters are outside this discovery change. Existing development tests already cover live add/error/repair/rename/delete, priority, data/manifest ordering, metadata, interception, and parallel associations. Remaining current-API additions: client navigation across a priority transition; metadata source replacement; custom App not-found/error recovery. These do not require the proposed snapshot API.

## B: shared routing policy

The local reference host already invokes the real `@next/routing` package and emitted Node handlers. Its coverage is a representative baseline, not parity for all selected Node tests.

Additional cases possible now: table-driven exact/dynamic/catch-all precedence; beforeFiles/afterFiles/fallback termination; basePath plus locale/data URLs; encoded path near misses; request-header overrides using a real emitted Proxy; streaming first-byte and cancellation barriers; background work completion. Assert each host against fixed expectations, then compare semantic results. Keep repeated Set-Cookie values separate and preserve streamed request bodies. An external rewrite needs a local upstream server, not an external provider. The reference host must grow only the host effects needed for these assertions, using the resolver's existing status/header/body/invocation results.

NoFallback continuation requires an explicit adapter invocation feedback contract, which `resolveRoutes` does not currently expose. Once specified, make candidate 1 reject an unknown `fallback:false` parameter; candidate 2 must serve the expected marker exactly once. Add a request deadline and a test-owned destination counter to detect retry loops. Do not infer continuation from successful ordinary 404 handling or private minimal-mode tests.

## C: shared catalog and generation reuse

Current production direct rendering uses `next({ customServer: false, dev: false })`, without an outer fsChecker. Current custom dev `app.render()` forwards through the outer router; it cannot establish an independent inner development catalog.

Add current-API direct production cases for Pages API classification, basePath/locale/data normalization, grouped/parallel App selection, missing routes, and on-demand fallback lookup. Reuse the existing fixtures/config variants rather than creating a cross product. For each path assert route-specific output, not just a host marker or equality between two implementations.

When a shared development generation service exists, hold an old request while installing a new exact/dynamic/catch-all inventory. New requests must see the new destination, removed URLs must stop matching, the held request must finish under its valid generation, and repeated requests must stay stable. Do not assert helper names, matcher allocation counts, or private cache shapes. Reusing matchers within an unchanged generation is a performance property; establish it with an agreed focused benchmark/profile rather than a public e2e call-count assertion.

## D: invocation results

Current body/header/response/cancellation/trace tests and E's `after` companions provide reusable assertions. Additional current-API coverage should exercise the same boundary table through the emitted-handler host: continuation, direct Proxy response, rewrite, thrown error, not-found, and a Server Action. Require final status/body/cookies, one request span with the incoming trace ID and correct parent, and no duplicate request handling.

The NoFallback case depends on B's invocation feedback contract. Do not snapshot request metadata or exception representations to anticipate typed operations.

## E: scoped services and disposal

The active same-project recreate test deliberately requires changed routes/config, old-port reuse, same PID, and natural child exit. A process killed by cleanup is a failed disposal result. Preserve any exposed baseline failure until the ownership implementation changes.

First establish whether two same-bundler custom development instances are supported. If supported, start A and B in one process with distinct directories/ports/config markers; serve and hot-update both, close A, reuse A's port, then hot-update B and verify B's application WebSocket and destination remain live. Finally close B and require natural process exit. Do not assume mixed-bundler instances are supported. Keep upgrade handling assertions behavioral: HMR state preservation and application echo, not listener-array lengths.

## F: selection rules

Current tests cover automatic default, both Turbo aliases, explicit Webpack, environment Webpack/Rspack, config-selected Rspack, and pair/triple conflicts through CLI and custom API. They fetch an actual compiled page and inspect its backend bootstrap.

Additional current-API table rows: explicit Turbo/Webpack combined with `withRspack` config (must fail); redundant Turbo aliases (must agree); explicit flag versus conflicting environment; a custom webpack hook under automatic mode versus explicit selection. Specify which inputs are supported public choices and which are test-only environment controls. Reuse isolated subprocess environments and assert failure before a listener or successful page is advertised. Correct custom-API pair-conflict expectations remain active even while the baseline accepts them.

## G: semantic configuration operations

The current additions change and delete a test-owned environment value and tsconfig alias, then restore both. Extend instrumentation, middleware and generated-type assertions only where the planned operation changes those consumers: change a test-owned env value read by instrumentation/Proxy; verify a fresh request observes it; add/remove a route and inspect generated route types. Run dev Turbo/Webpack, using request/browser/type output rather than backend method counts. These tests can be added against current APIs; they are not blocked by an invented operations interface.

## H: adapter lowering

Existing companions check callback context, all executable kinds, unique outputs, referenced assets, runtime/path metadata, fallback metadata, locale/query normalization, root handling, packaged Pages API invocation and Turbo-scoped hashes. Both production bundlers must keep their own valid outputs; byte-identical bundles or hashes across bundlers are not required.

Remaining current-API gaps: execute more emitted dynamic/locale handlers in the reference host, verify data/RSC selection and conditional stage destinations, and package an App handler alongside the existing Pages API packaging test. A future collection/lowering split should run the same callback assertions without asserting internal collector names or traversal counts. External deployment providers and production adapter HMR are not acceptance requirements here.
