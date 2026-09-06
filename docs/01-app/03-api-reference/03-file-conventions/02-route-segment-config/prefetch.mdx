---
title: prefetch
description: API reference for the prefetch route segment config.
related:
  title: Next Steps
  description: Learn how to use instant navigations in practice.
  links:
    - app/guides/instant-navigation
    - app/api-reference/file-conventions/route-segment-config/instant
---

The `prefetch` route segment config controls how a segment is prefetched during client-side navigation. By default, the framework manages the strategy based on the app's [`partialPrefetching`](/docs/app/api-reference/config/next-config-js/partialPrefetching) setting. To override per segment, set this export to one of the values below.

> **Good to know**:
>
> - The `prefetch` export only works when [`cacheComponents`](/docs/app/api-reference/config/next-config-js/cacheComponents) is enabled.
> - `prefetch` cannot be used when the segment is a Client Component.
> - The meaningful values to set are `'partial'` and `'force-disabled'`. `'auto'` is the default and is equivalent to omitting the export; don't write `prefetch = 'auto'` explicitly.

```tsx filename="layout.tsx | page.tsx" switcher
export const prefetch = 'partial'

export default function Page() {
  return <div>...</div>
}
```

```jsx filename="layout.js | page.js" switcher
export const prefetch = 'partial'

export default function Page() {
  return <div>...</div>
}
```

## Options

### `'partial'`

Opts the segment into [Partial Prefetching](/docs/app/guides/adopting-partial-prefetching) without enabling the global [`partialPrefetching`](/docs/app/api-reference/config/next-config-js/partialPrefetching) flag. A `<Link>` pointing at a segment with `prefetch = 'partial'` loads the per-route [App Shell](/docs/app/glossary#app-shell) instead of the legacy full prefetch. Set this on the destination, not the link.

For links that opt into a wider prefetch with [`<Link prefetch={true}>`](/docs/app/api-reference/components/link#prefetch), Next.js uses per-link prefetching. The server renders a fresh response that resolves URL data (`params`, `searchParams`, and the full URL). On pages where all the content is statically renderable, Next.js serves prefetches from the static cache. If a page accesses non-static data, it's prefetched at runtime.

Use this for incremental adoption when you can't enable `partialPrefetching` for the entire app at once. Once every route in scope has `prefetch = 'partial'`, enable the global flag and remove the per-route exports.

> **Good to know**: When Next.js performs a per-link prefetch for a segment, all downstream segments are included in the same request. Segments deeper in the tree that are configured with `'force-disabled'` will still be prefetched as part of the response.

```tsx filename="page.tsx"
export const prefetch = 'partial'
```

### `'force-disabled'`

Never prefetch this segment. The client will not request segment data ahead of navigation. Use this for segments where prefetching would be wasteful, for example pages behind authentication that are rarely visited.

> **Good to know**: `'force-disabled'` does not prevent Next.js from prefetching metadata about the route. However, the actual segment data for this segment and all deeper segments will be omitted from prefetching.

## Relationship with the `<Link prefetch>` prop

A prefetch starts with a `<Link>` that expresses intent (should this destination be prefetched, and how eagerly), and ends at a segment that sets a cost ceiling (how much work is it OK to do ahead of time, for any link that points here).

A destination can't know which links target it, so the segment config caps what any `<Link prefetch={true}>` pulls:

- [`'partial'`](#partial): App Shell for default links; a `<Link prefetch={true}>` additionally resolves URL data (`params`, `searchParams`, and the full URL) and the cached content behind it.
- [`'force-disabled'`](#force-disabled): skip segment data entirely.

`<Link prefetch={false}>` skips prefetching at the link level regardless of how the destination is configured.

> **Good to know**: On pages where all the content is statically renderable, Next.js serves prefetches from the static cache (or a CDN). If a page accesses non-static data like cookies or headers, it's prefetched at runtime with a fresh server render, which costs server CPU per page view.

## TypeScript

```tsx
type Prefetch = 'auto' | 'partial' | 'force-disabled'

export const prefetch: Prefetch = 'partial'
```

## Version History

| Version   | Changes                                              |
| --------- | ---------------------------------------------------- |
| `v16.x.x` | `prefetch` export introduced (Cache Components only) |
