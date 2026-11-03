# Rely on owned invariants

rule: Don't guard against states our own code can't produce. State the invariant once and build on it. User input is never "owned".

severity: comment

## Signs in review

- A check for a state our own code can't produce, often marked "just in case"
- The same invariant checked at several layers
- A `throw new Error('this should never happen')` for an internal state

## Example

Bad:

```ts
const entry = readOrCreateRouteCacheEntry(now, task, key)
if (entry === undefined) {
  // Shouldn't happen, but just in case
  return null
}
```

Good: `readOrCreateRouteCacheEntry` always returns an entry, so its type says so and callers don't check.

## Why

Defensive checks for impossible states hide which states are possible.
