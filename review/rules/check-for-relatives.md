# Check for relatives

rule: When a PR fixes a subtle bug, it says whether similar code has the same bug.

severity: comment. If a sibling path clearly has the same bug and the PR fixes only one, that's a correctness bug: escalate (medium).

## Signs in review

- A race or ordering fix in one of several functions that follow the same pattern
- A fix in one router reducer, cache, or stream helper when siblings do the same thing

## Example

Bad: fixes a stale-entry check in `readOrCreateRouteCacheEntry` and says nothing about `readOrCreateSegmentCacheEntry`, which does the same check.

Good:

> `readOrCreateSegmentCacheEntry` had the same check; fixed there too, with a test.

## Why

A subtle bug usually comes from a pattern, not a line.
