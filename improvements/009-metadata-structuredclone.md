# Improvement 009: Replace structuredClone with Shallow Copy in Metadata Resolution

## Problem

### 1. `structuredClone()` for metadata and viewport merging

`mergeMetadata` and `mergeViewport` in `resolve-metadata.ts` use `structuredClone()` to create deep copies of the accumulated metadata/viewport objects before merging new values:

```typescript
const newResolvedMetadata = structuredClone(resolvedMetadata) // Line 235
const newResolvedViewport = structuredClone(resolvedViewport) // Line 459
```

`structuredClone` is a V8 operation that:

- Traverses the entire object graph recursively
- Handles circular references (unnecessary here)
- Creates deep copies of all nested objects
- Is significantly slower than object spread for flat/shallow objects

This runs **per segment** during metadata resolution — for a typical app with 4-6 layout segments, that's 4-6 deep clones per request.

### 2. `Object.entries()` in `convertUrlsToStrings`

The `convertUrlsToStrings` helper uses `Object.entries(input)` which creates an intermediate `[key, value][]` array allocation on every call. This function is called recursively for each metadata property containing URLs (openGraph, twitter, alternates, etc.).

### Impact on throughput

For a page with 5 segments, each with openGraph and twitter metadata:

- 10 `structuredClone` operations per request (5 metadata + 5 viewport)
- Multiple `Object.entries` allocations per metadata property

## Solution

### Replace `structuredClone` with object spread

Both `mergeMetadata` and `mergeViewport` only **replace** top-level properties — they never mutate nested objects in-place. This was verified by examining all code paths:

- `mergeMetadata`: every switch case either replaces a top-level property (`newResolvedMetadata.title = ...`) or creates a new object (`Object.assign({}, ...)`)
- `mergeStaticMetadata`: reads nested objects via spread (`{...target.openGraph, images}` — creates new object), then replaces the top-level property
- `mergeViewport`: sets scalar values or calls `resolveThemeColor()` which returns a new array

```typescript
// BEFORE: Deep clone (traverses entire object graph)
const newResolvedMetadata = structuredClone(resolvedMetadata)
const newResolvedViewport = structuredClone(resolvedViewport)

// AFTER: Shallow copy (single-level property assignment)
const newResolvedMetadata: ResolvedMetadata = { ...resolvedMetadata }
const newResolvedViewport: ResolvedViewport = { ...resolvedViewport }
```

### Replace `Object.entries()` with `for...in`

```typescript
// BEFORE: Creates intermediate array
for (const [key, value] of Object.entries(input)) {
  result[key] = convertUrlsToStrings(value)
}

// AFTER: No intermediate array allocation
for (const key in input) {
  result[key] = convertUrlsToStrings((input as Record<string, unknown>)[key])
}
```

## Behavioral Correctness

- **Shallow copy safety**: Both merge functions only set top-level properties. Nested objects are either replaced entirely or left as shared references. Since the metadata chain is append-only (each segment adds/replaces properties, never mutates nested values), reference sharing is safe.
- **`for...in` equivalence**: `for...in` iterates own + inherited enumerable properties. For plain objects (which metadata values are), this is equivalent to `Object.entries()` which only covers own enumerable properties. In practice, metadata objects have no inherited enumerable properties, so the behavior is identical.
- **No change in resolved metadata output**: The same properties are set with the same values.

## Files Changed

- `packages/next/src/lib/metadata/resolve-metadata.ts` — replace `structuredClone` with object spread, replace `Object.entries` with `for...in`
