# Use Cache

<!-- Owners and paths: the [use-cache] section of review/OWNERS. Owners: replace the TODOs. -->

## Context

- The `"use cache"` directive runtime: the cache wrapper, cache handlers (`default`, tiered/remote), `cacheLife`/`cacheTag`, the dev probe worker, and how cached entries are serialized/revalidated.
- TODO: key files and the invariants that must hold

## What failure looks like

- Stale data served past `expire`, revalidation that never lands, cache keys that collide across routes/params, prerender hanging on a cached promise, dev showing a cached entry that prod would not.
- TODO: past regressions and reverts, with links

## Escalate when

- Changes to cache-key derivation (`use-cache-wrapper.ts` key/encoding), `CacheHandler` interface in `cache-handlers/types.ts` (public API, strong), SWR/expire math (medium).
- TODO

## Rules

- TODO

## Preferences

- TODO
