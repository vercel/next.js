# Incremental Cache and Revalidation

<!-- Owners and paths: the [incremental-cache-and-revalidation] section of review/OWNERS. Owners: replace the TODOs. -->

## Context

- ISR and fetch caching: `IncrementalCache` (file-system/memory/custom handler), the response cache that dedupes renders, patched `fetch`, `revalidateTag`/`revalidatePath`/`unstable_cache`, cache-control headers, and the on-disk `.next/cache` layout.
- TODO: key files and the invariants that must hold

## What failure looks like

- Revalidation storms, ISR serving a 404 shell forever.
- TODO: past regressions and reverts, with links

## Escalate when

- Any change to cache key construction, `Cache-Control`/`Vary` emission, or tag-manifest semantics (strong); fetch-cache opt-in/out defaults (strong, public behavior).
- TODO

## Rules

- TODO

## Preferences

- TODO
