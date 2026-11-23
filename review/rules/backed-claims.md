# Backed claims

rule: Claims like "faster" or "smaller" come with a reason, and a number where there's a benchmark.

severity: comment. Escalate (medium) when the claim is the PR's whole motivation and nothing backs it.

## Signs in review

- "Improves performance", "reduces bundle size", "more efficient" with no mechanism or measurement
- A perf PR that adds complexity and has no before/after

## Example

Bad:

> Memoize `createHref` for better performance.

Good:

> `createHref` ran once per `<Link>` per render, and a 500-link page spent 18ms in it per navigation (profile attached). Memoizing on the href string drops that to 1ms.

## Why

A claim with no reason can't be checked, and complexity added for a speedup that isn't there stays forever.
