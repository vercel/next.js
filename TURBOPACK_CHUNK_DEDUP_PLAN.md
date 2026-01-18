# Turbopack Chunk Deduplication Plan

## Problem Statement

During Cache Components prerenders, the same chunks are loaded multiple times concurrently by different parallel render contexts (server prerender, client prerender, etc.). This results in:

- **~1,100 chunk load calls** when only ~150-200 unique chunks exist
- **~85% of chunk loads are redundant** (same chunk requested multiple times)
- **Client cache settlement takes 1.4s** primarily due to chunk loading
- Each redundant load still pays I/O overhead even if the underlying runtime caches

## Current Investigation Findings

### Evidence from Logs (Jan 17, 2026)

The same 6 core chunks are loaded 6 times each in the first batch:

```
Chunks #0-5:   [root-of-the-server]__f0e414ce._.js, packages_geist_src..., etc.
Chunks #6-11:  SAME 6 chunks again
Chunks #12-17: SAME 6 chunks again
...
```

This pattern repeats throughout the ~1,100 chunk loads.

### Root Cause

Each parallel SSR render context independently requests chunks:

1. Server prerender requests chunk A
2. Client prerender also requests chunk A (before #1 completes)
3. Multiple component trees within each prerender also request chunk A

Turbopack's `loadChunk` returns a new promise for each call, even if the chunk is already being fetched. There's no deduplication at the request level.

## Temporary Workaround (Implemented)

Added a deduplication cache at the `__next_chunk_load__` wrapper level in `app-render.tsx`:

```typescript
const inFlightChunkLoads = new Map<string | number, Promise<unknown>>()

const __next_chunk_load__ = (...args) => {
  const chunkId = args[0]

  // Check if this chunk is already being loaded
  const existingPromise = inFlightChunkLoads.get(chunkId)
  if (existingPromise) {
    // Reuse the existing promise - deduplication!
    return existingPromise
  }

  // Load the chunk and cache the promise
  const loadingChunk = instrumented.loadChunk(...args)
  inFlightChunkLoads.set(chunkId, loadingChunk)

  // Clean up when done
  loadingChunk.then(
    () => inFlightChunkLoads.delete(chunkId),
    () => inFlightChunkLoads.delete(chunkId)
  )

  return loadingChunk
}
```

**Limitations of this workaround:**

- Only applies to Cache Components prerenders (where `shouldTrackModuleLoading()` is true)
- Map is scoped to the render function, not globally
- Doesn't help non-prerender chunk loading

## Proposed Turbopack Fix

### Option 1: Deduplication in Turbopack's loadChunk (Recommended)

**Location**: `turbopack/crates/turbopack-ecmascript-runtime/js/src/shared/runtime-utils.ts` (or similar)

**Implementation**:

```typescript
// In Turbopack's chunk loading runtime
const _inFlightChunks = new Map<ChunkPath, Promise<void>>()

export function loadChunk(chunkPath: ChunkPath): Promise<void> {
  // Check if already loading
  let promise = _inFlightChunks.get(chunkPath)
  if (promise) {
    return promise
  }

  // Check if already loaded
  if (isChunkLoaded(chunkPath)) {
    return Promise.resolve()
  }

  // Actually load the chunk
  promise = doLoadChunk(chunkPath)
  _inFlightChunks.set(chunkPath, promise)

  promise.finally(() => {
    _inFlightChunks.delete(chunkPath)
  })

  return promise
}
```

**Pros**:

- Fixes the problem at the source
- Benefits all consumers (not just Cache Components)
- No memory overhead from multiple promises for same chunk

**Cons**:

- Requires Turbopack changes
- Need to verify no assumptions about unique promises

### Option 2: Deduplication in Next.js Runtime Layer

**Location**: `packages/next/src/server/app-render/module-loading/`

**Implementation**: Create a global deduplication layer that wraps all chunk loading.

**Pros**:

- Can be implemented faster (no Turbopack changes)
- More control over behavior

**Cons**:

- Adds overhead at the Next.js layer
- Doesn't benefit other Turbopack consumers

## Files to Investigate in Turbopack

1. **Chunk loading entry point**:
   - `turbopack/crates/turbopack-ecmascript-runtime/js/src/`
   - Look for `loadChunk`, `__turbopack_load__`, or similar

2. **SSR-specific chunk loading**:
   - `turbopack/crates/turbopack-node/`
   - `turbopack/crates/turbopack-nodejs/`

3. **Module resolution**:
   - `turbopack/crates/turbopack-ecmascript/src/chunk/`

## Testing Plan

1. **Measure baseline** (current state with workaround):
   - Total chunks loaded
   - Deduplicated chunks
   - Client settlement time

2. **Implement Turbopack fix**

3. **Verify improvement**:
   - Should see `totalChunks ≈ uniqueChunks`
   - Client settlement time should reduce significantly
   - No DUPLICATE logs should appear

## Expected Impact

| Metric            | Before | After (Expected) |
| ----------------- | ------ | ---------------- |
| Total chunk loads | ~1,100 | ~150-200         |
| Duplicate ratio   | ~85%   | 0%               |
| Client settlement | 1.4s   | ~200-400ms       |
| Total prerender   | 3s+    | ~1.5-2s          |

## Related Files

- `packages/next/src/server/app-render/app-render.tsx` - Current workaround location
- `packages/next/src/server/app-render/module-loading/track-module-loading.instance.ts` - Tracking/logging
- `crates/next-core/src/next_client/context.rs` - Chunking configuration

## Next Steps

1. [ ] Test the current workaround to validate it works
2. [ ] Measure impact of the workaround
3. [ ] File issue in Turbopack repo with findings
4. [ ] Implement proper fix in Turbopack loadChunk
5. [ ] Remove Next.js workaround once Turbopack fix lands
