# Improvement 010: Replace JSON.parse(JSON.stringify()) with structuredClone for PPR Postponed State

## Problem

Two PPR resume paths deep-clone the `postponed` state using the `JSON.parse(JSON.stringify())` anti-pattern:

```typescript
// Lines 5670, 5958
resumeAndAbort(<App .../>, JSON.parse(JSON.stringify(postponed)), ...)
```

This pattern:

- Serializes the entire object graph to a JSON string
- Parses the JSON string back into a new object
- Is 2-5x slower than `structuredClone` for typical object sizes
- Silently drops `undefined` values and converts `Date` to strings

## Solution

```typescript
// BEFORE
JSON.parse(JSON.stringify(postponed))

// AFTER
structuredClone(postponed)
```

## Behavioral Correctness

- `postponed` is already JSON-serializable (stored in cache as JSON), so `structuredClone` handles it identically
- `structuredClone` preserves the same object shape as `JSON.parse(JSON.stringify())` for JSON-safe objects
- The clone is needed because `resumeAndAbort` may mutate the state

## Files Changed

- `packages/next/src/server/app-render/app-render.tsx` — replace 2 instances of `JSON.parse(JSON.stringify(postponed))` with `structuredClone(postponed)`
