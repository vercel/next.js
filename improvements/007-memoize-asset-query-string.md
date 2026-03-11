# Improvement 007: Memoize getAssetQueryString and Pre-compile Font Regex

## Problem

### 1. `getAssetQueryString()` recomputes identical strings 10+ times per request

`getAssetQueryString(ctx, addTimestamp)` is called from multiple hot-path locations during SSR:

- `get-layer-assets.tsx` — once per font file + once per script tag
- `render-css-resource.tsx` — once per CSS file
- `create-component-styles-and-scripts.tsx` — once per script
- `app-render.tsx` — 2-3 times for polyfills and bootstrap scripts

For a typical page with 5 CSS files, 2 fonts, 3 scripts, and 2 polyfills, that's **12+ calls** per request — all producing the identical string since the inputs (`ctx.requestTimestamp`, `ctx.sharedContext.clientAssetToken`) are constant for the request.

Each call performs string concatenation and conditional checks unnecessarily.

### 2. Font extension regex compiled per font file

In `get-layer-assets.tsx`, the regex `/\.(woff|woff2|eot|ttf|otf)$/` is compiled inside a `for` loop, creating a new RegExp object for each font file on every request.

### Impact on throughput

For 1,000 concurrent requests:

- 12,000 redundant string concatenations from `getAssetQueryString`
- Thousands of unnecessary RegExp compilations from the font loop

## Solution

### Memoize `getAssetQueryString` with WeakMap

```typescript
// Two WeakMaps keyed by ctx — one per addTimestamp value
const cacheWithTimestamp = new WeakMap<object, string>()
const cacheWithoutTimestamp = new WeakMap<object, string>()

export function getAssetQueryString(ctx, addTimestamp) {
  const cache = addTimestamp ? cacheWithTimestamp : cacheWithoutTimestamp
  const cached = cache.get(ctx)
  if (cached !== undefined) return cached

  // ... compute qs ...

  cache.set(ctx, qs)
  return qs
}
```

WeakMap ensures no memory leak — when `ctx` is GC'd after the request, the cache entry is also collected.

### Pre-compile font extension regex at module scope

```typescript
// BEFORE: Compiled per iteration
for (let i = 0; i < preloadedFontFiles.length; i++) {
  const ext = /\.(woff|woff2|eot|ttf|otf)$/.exec(fontFilename)![1]
}

// AFTER: Compiled once at module load
const fontExtRegex = /\.(woff|woff2|eot|ttf|otf)$/

for (let i = 0; i < preloadedFontFiles.length; i++) {
  const ext = fontExtRegex.exec(fontFilename)![1]
}
```

## Behavioral Correctness

- `getAssetQueryString` is a pure function of `ctx` and `addTimestamp` — memoization produces identical output
- WeakMap keys are the per-request `ctx` object — no cross-request leakage
- Pre-compiled regex produces identical match results
- No change in rendered HTML output

## Files Changed

- `packages/next/src/server/app-render/get-asset-query-string.ts` — memoize with WeakMap
- `packages/next/src/server/app-render/get-layer-assets.tsx` — pre-compile font regex at module scope
