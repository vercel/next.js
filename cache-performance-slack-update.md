# Cache Performance Investigation Update

I've been investigating that ~1.5s unexplained gap (the red circle) we're seeing in traces during "use cache" operations. Turns out **client-side chunk loading during the initial prerender phase** is the bottleneck, not cache writes. Logs/Trace attached.

## What I Found

Added debug logging with explicit chunk counting and discovered **1,281 client-side chunks** loading during the initial client prerender:

```
[prerenderToStream] BEFORE trackPendingModules - Module stats: totalChunks=0, totalImports=0
[prerenderToStream] cacheSignal.cacheReady() (client) starting at 2113.50ms
... (1,281 chunk loads tracked via CacheSignal beginRead/endRead pairs) ...
[prerenderToStream] cacheSignal.cacheReady() (client) completed in 865.04ms - Module loading stats: totalChunks=1281, totalImports=0
```

**Total: 1,281 chunks taking ~865ms-1,500ms** (varies by run)

## Root Cause

The `cacheComponents` feature awaits all dynamic imports during the initial client prerender:

```typescript
// packages/next/src/server/app-render/app-render.tsx
trackPendingModules(cacheSignal)
await cacheSignal.cacheReady() // ← Blocks until ALL chunks load
```

The code comment says this is intentional: _"A top-level dynamic import may reveal more caches that need to be filled"_

But here's the thing - the initial client prerender is purely for cache warming and **its result is discarded**.

## Phase Timing Breakdown

| Phase                                   | Duration  | Status            |
| --------------------------------------- | --------- | ----------------- |
| `initialServerPayload`                  | 172ms     | ✅ Normal         |
| `cacheSignal.cacheReady()` (server)     | 791ms     | ✅ Cache ops      |
| `createReactServerPrerenderResult`      | 1ms       | ✅ Fast           |
| **`cacheSignal.cacheReady()` (client)** | **865ms** | ❌ **Bottleneck** |
| `finalServerPrerender`                  | 29ms      | ✅ Normal         |
| `finalClientPrerender`                  | 156ms     | ✅ Normal         |

## Recommendations

### For Vercel Docs team (short-term)

1. Use `next/dynamic` with `ssr: false` for non-critical client components
2. Consolidate dynamic imports to reduce chunk count

### For Next.js team (medium-term)

Consider whether the initial client prerender needs to await ALL module loads:

- The initial prerender result is discarded anyway
- Module loads may not even contain `"use cache"` functions
- Could track without blocking, or add a timeout

cc @ztanner, @janka (lubieowoce) (for viz on the dynamic imports), @jimmy
