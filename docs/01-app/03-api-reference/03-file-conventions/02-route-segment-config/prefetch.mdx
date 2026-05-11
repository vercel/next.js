---
title: prefetch
description: API reference for the prefetch route segment config.
version: draft
related:
  title: Next Steps
  description: Learn how to use instant navigations in practice.
  links:
    - app/guides/instant-navigation
    - app/api-reference/file-conventions/route-segment-config/instant
---

The `unstable_prefetch` route segment config controls how a segment is prefetched during client-side navigation. The default (`'auto'`) lets Next.js manage the strategy on your behalf — today that always means a static prefetch. The `force-*` options let you declare a specific behavior — use them with care, since they can affect both navigation latency and prefetch cost.

When you do set this export, consider pairing it with [`unstable_instant`](/docs/app/api-reference/file-conventions/route-segment-config/instant) so validation can confirm that navigations to this segment actually produce an instant UI from the prefetched data. This is especially important for runtime prefetching.

> **Good to know**:
>
> - The `unstable_prefetch` export only works when [`cacheComponents`](/docs/app/api-reference/config/next-config-js/cacheComponents) is enabled.
> - `unstable_prefetch` cannot be used when the segment is a Client Component.

```tsx filename="layout.tsx | page.tsx" switcher
export const unstable_prefetch = 'force-runtime'

export default function Page() {
  return <div>...</div>
}
```

```jsx filename="layout.js | page.js" switcher
export const unstable_prefetch = 'force-runtime'

export default function Page() {
  return <div>...</div>
}
```

## Options

### `'auto'` (default)

Lets Next.js manage prefetching for this segment. Today this always means a static prefetch — to try runtime prefetching, opt in explicitly with [`'force-runtime'`](#force-runtime).

A future release will use [`unstable_instant`](/docs/app/api-reference/file-conventions/route-segment-config/instant) validation to choose between static and runtime prefetching automatically. Leaving the default in place means your app will pick up that improvement without code changes.

You typically don't need to set this explicitly — omitting the export has the same effect.

### `'force-runtime'`

Always prefetch this segment at runtime. The server renders a fresh response for the segment during prefetch, allowing runtime data like cookies, headers, and search params to be included. This is useful for personalized content that should still be available instantly on navigation.

> **Good to know**: When a segment uses runtime prefetching, all downstream segments are included in the same runtime prefetch request. This means segments deeper in the tree that are configured with `'force-static'` or `'force-disabled'` will still be prefetched as part of the runtime response.

```tsx filename="page.tsx"
export const unstable_prefetch = 'force-runtime'
```

### `'force-static'`

Always prefetch this segment statically, even if it has not been validated with `unstable_instant`. Use this when you know the segment produces a valid static shell but do not want to set up instant validation.

### `'force-disabled'`

Never prefetch this segment. The client will not request segment data ahead of navigation. Use this for segments where prefetching would be wasteful, for example pages behind authentication that are rarely visited.

> **Good to know**: `'force-disabled'` does not prevent Next.js from prefetching metadata about the route. However, the actual segment data for this segment and all deeper segments will be omitted from prefetching.

## Relationship with the `<Link prefetch>` prop

The `unstable_prefetch` segment config and the [`<Link prefetch>` prop](/docs/app/api-reference/components/link#prefetch) control different aspects of prefetching:

- The **segment config** informs Next.js about a segment's caching characteristics — whether its data can be prefetched statically, requires a runtime prefetch with the user's session, or should be skipped entirely. This applies to the segment regardless of which link points to it.
- The **`<Link prefetch>` prop** reflects the anticipated intent of a specific link on a specific page. A link that users rarely click can be deprioritized with `prefetch={false}`, independent of how the destination segments are configured.

In general, both of these are special circumstances. The default behavior — where Next.js manages prefetching for you — is optimized to provide a good navigation experience without manual configuration.

## TypeScript

```tsx
type Prefetch = 'auto' | 'force-disabled' | 'force-static' | 'force-runtime'

export const unstable_prefetch: Prefetch = 'force-runtime'
```

## Version History

| Version   | Changes                                                       |
| --------- | ------------------------------------------------------------- |
| `v16.x.x` | `unstable_prefetch` export introduced (Cache Components only) |
