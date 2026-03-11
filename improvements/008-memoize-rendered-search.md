# Improvement 008: Memoize getRenderedSearch per Query Object

## Problem

`getRenderedSearch(query)` is called 4 times per SSR request with the same `query` object:

- Line 631 — `generateDynamicRSCPayload` (navigation requests)
- Line 641 — `generateDynamicRSCPayload` (navigation requests)
- Line 1749 — `getRSCPayload`
- Line 1886 — `getRSCPayload`

Each call iterates over all query parameters, calling `encodeURIComponent()` on every key and value, then joins them with `&`. For a URL with 5 query parameters, that's 10 `encodeURIComponent` calls × 4 invocations = 40 redundant encoding operations per request.

### Impact on throughput

The query object is the same reference for all calls within a request — the result is always identical. For pages with many search parameters (e.g., filter-heavy e-commerce), the redundant encoding adds measurable overhead.

## Solution

Memoize using a WeakMap keyed by the query object:

```typescript
const renderedSearchCache = new WeakMap<NextParsedUrlQuery, string>()

function getRenderedSearch(query: NextParsedUrlQuery): string {
  const cached = renderedSearchCache.get(query)
  if (cached !== undefined) return cached

  // ... compute result ...

  renderedSearchCache.set(query, result)
  return result
}
```

## Behavioral Correctness

- `getRenderedSearch` is a pure function of the query object — memoization produces identical output
- WeakMap keyed by the per-request query object — no cross-request leakage
- After the request completes and the query object is GC'd, the cache entry is also collected
- No change in rendered output or search string format

## Files Changed

- `packages/next/src/server/app-render/app-render.tsx` — memoize `getRenderedSearch` with WeakMap
