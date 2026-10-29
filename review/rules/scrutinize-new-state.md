# Scrutinize new state

rule: Every new field, flag, cache entry, or request-meta key is scrutinized like an algorithm: is it necessary, can it be derived, can it merge with an existing one?

severity: comment

## Signs in review

- A new field derivable from others: a second source of truth to keep in step
- A boolean that encodes a mode, or a second copy of a structure for one case
- State written in one place and cleared in several
- A field whose name needs a comment to say what it means

## Example

Bad:

```ts
type RouteCacheEntry = {
  status: EntryStatus
  isFulfilled: boolean // true when status === EntryStatus.Fulfilled
  // ...
}
```

Good: read `entry.status === EntryStatus.Fulfilled` where it's needed.

## Why

A field is cheap to add and costly to keep. Every later change has to keep it right.
