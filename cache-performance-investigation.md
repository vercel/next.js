# Cache Performance Investigation: `cacheComponents` Prerender Delay

Investigation into a ~1.2s unexplained gap in traces during `"use cache"` operations revealed that **client-side chunk loading during the initial prerender phase** is the bottleneck, not cache writes.

## The Problem

Traces for pages using `cacheComponents` show a large untraced gap (gray bar) between the end of visible `use cache` spans and request completion. Initial suspicion was that cache writes were blocking the response.

## The Gap in the Trace

**The ~1.2s gap between the last visible span (~3.2s) and prerender completion (~4.4s) is untraced activity.**

The trace visually shows:

1. **Visible activity (2.2s - 3.2s):** All `use cache` operations, `fetch POST` to suspense-cache, `generateMetadata`, etc. - fully traced
2. **Gray gap (3.2s - 4.4s):** Untraced ~1.2s of activity
3. **Completion (~4.4s - 4.96s):** Final prerender phases

## Root Cause: Client-Side Chunk Loading

Debug logging with explicit chunk counting revealed **1,281 client-side chunks** loading during the initial client prerender phase:

```
[prerenderToStream] BEFORE trackPendingModules - Module stats: totalChunks=0, totalImports=0
[prerenderToStream] cacheSignal.cacheReady() (client) starting at 2113.50ms
... (1,281 chunk loads tracked via CacheSignal beginRead/endRead pairs) ...
[prerenderToStream] cacheSignal.cacheReady() (client) completed in 865.04ms - Module loading stats: totalChunks=1281, totalImports=0
```

The `cacheComponents` feature awaits all dynamic imports during the initial client prerender:

```typescript
// packages/next/src/server/app-render/app-render.tsx
trackPendingModules(cacheSignal)
await cacheSignal.cacheReady() // ← Blocks until ALL chunks load
```

The intent (per code comment): _"A top-level dynamic import may reveal more caches that need to be filled"_

However, the initial client prerender is purely for cache warming—**its result is discarded**.

## Cache Writes Are NOT the Bottleneck

The trace confirms cache writes complete DURING the visible traced portion, not in the gap:

- `fetch POST https://iad1.suspense-cache.vercel-infra.com/...` spans (989.79ms, 995.29ms) complete before ~3.2s
- `use cache SET` spans are short (3-406ms) and overlap with other work
- Cache writes are pushed to `pendingRevalidateWrites` and don't block the response

## Phase Timing Breakdown

From instrumented logs:

| Phase                                   | Duration  | Status            |
| --------------------------------------- | --------- | ----------------- |
| `initialServerPayload`                  | 172ms     | ✅ Normal         |
| `cacheSignal.cacheReady()` (server)     | 791ms     | ✅ Cache ops      |
| `createReactServerPrerenderResult`      | 1ms       | ✅ Fast           |
| **`cacheSignal.cacheReady()` (client)** | **865ms** | ❌ **Bottleneck** |
| `finalServerPrerender`                  | 29ms      | ✅ Normal         |
| `finalClientPrerender`                  | 156ms     | ✅ Normal         |
| `continueDynamicPrerender`              | 23ms      | ✅ Fast           |

**Note:** The client `cacheReady()` duration varies between 865ms-1,500ms depending on the run.

## Why Chunk Loading Is Slow

The CacheSignal logs show chunks loading in rapid sequential pairs:

```
[CacheSignal] beginRead: first pending read started, count is now 1 at 2120.05ms
[CacheSignal] endRead: all pending reads complete, count is now 0 at 2133.81ms
[CacheSignal] beginRead: first pending read started, count is now 1 at 2136.50ms
[CacheSignal] endRead: all pending reads complete, count is now 0 at 2320.90ms
... (continues for 1,281 chunks)
```

Each chunk load:

1. Triggers `beginRead()` on the CacheSignal
2. Completes and triggers `endRead()`
3. May trigger more chunk loads (dependencies)

The cumulative effect of 1,281 sequential chunk loads creates the ~1s delay.

## Instrumentation Added

To diagnose this issue, logging was added to:

1. **`app-render.tsx`** - Timing for each `prerenderToStream` phase
2. **`cache-signal.ts`** - State transitions (beginRead/endRead)
3. **`track-module-loading.instance.ts`** - Chunk/import counting via `getModuleLoadingStats()`
4. **`use-cache-wrapper.ts`** - Cache SET timing and buffer sizes

## Recommendations

### Short-term (Application Level)

1. Use `next/dynamic` with `ssr: false` for non-critical client components
2. Consolidate dynamic imports to reduce chunk count
3. Audit client component tree for unnecessary dynamic imports

### Medium-term (Framework Level)

Consider whether the initial client prerender needs to await ALL module loads:

- The initial prerender result is discarded anyway
- Module loads may not contain `"use cache"` functions
- Could track without blocking, or add a timeout
- Could parallelize chunk loading more aggressively

### Potential Framework Changes

1. Add tracing spans for chunk loading phases
2. Consider a timeout for `cacheSignal.cacheReady()` in client prerender
3. Investigate why 1,281 chunks are needed (possible over-splitting)

## Files Modified During Investigation

- `packages/next/src/server/app-render/app-render.tsx` - Phase timing logs
- `packages/next/src/server/app-render/cache-signal.ts` - State transition logs
- `packages/next/src/server/app-render/module-loading/track-module-loading.instance.ts` - Stats tracking
- `packages/next/src/server/app-render/module-loading/track-module-loading.external.ts` - Stats export
- `packages/next/src/server/use-cache/use-cache-wrapper.ts` - Cache SET timing

---

_Investigation performed by instrumenting `prerenderToStream`, `CacheSignal`, `trackPendingModules`, and `getModuleLoadingStats()`._
