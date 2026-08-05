---
title: useSelectedLayoutSegments
description: API Reference for the useSelectedLayoutSegments hook.
---

`useSelectedLayoutSegments` is a **Client Component** hook that lets you read the active route segments **below** the Layout it is called from.

It is useful for creating UI in parent Layouts that need knowledge of active child segments such as breadcrumbs.

```tsx filename="app/example-client-component.tsx" switcher
'use client'

import { useSelectedLayoutSegments } from 'next/navigation'

export default function ExampleClientComponent() {
  const segments = useSelectedLayoutSegments()

  return (
    <ul>
      {segments.map((segment, index) => (
        <li key={index}>{segment}</li>
      ))}
    </ul>
  )
}
```

```jsx filename="app/example-client-component.js" switcher
'use client'

import { useSelectedLayoutSegments } from 'next/navigation'

export default function ExampleClientComponent() {
  const segments = useSelectedLayoutSegments()

  return (
    <ul>
      {segments.map((segment, index) => (
        <li key={index}>{segment}</li>
      ))}
    </ul>
  )
}
```

> **Good to know**:
>
> - Since `useSelectedLayoutSegments` is a [Client Component](/docs/app/getting-started/server-and-client-components) hook, and Layouts are [Server Components](/docs/app/getting-started/server-and-client-components) by default, `useSelectedLayoutSegments` is usually called via a Client Component that is imported into a Layout.
> - The returned segments include [Route Groups](/docs/app/api-reference/file-conventions/route-groups), which you might not want to be included in your UI. You can use the [`filter`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/filter) array method to remove items that start with a bracket.
> - For [catch-all](/docs/app/api-reference/file-conventions/dynamic-routes#catch-all-segments) routes, the matched segments are returned as a single joined string within the array. For example, given `app/blog/[...slug]/page.js`, calling from `app/layout.js` when visiting `/blog/a/b/c` returns `['blog', 'a/b/c']`, not `['blog', 'a', 'b', 'c']`.

## Parameters

```tsx
const segments = useSelectedLayoutSegments(parallelRoutesKey?: string)
```

`useSelectedLayoutSegments` _optionally_ accepts a [`parallelRoutesKey`](/docs/app/api-reference/file-conventions/parallel-routes#with-useselectedlayoutsegments), which allows you to read the active route segment within that slot.

## Returns

`useSelectedLayoutSegments` returns an array of strings containing the active segments one level down from the layout the hook was called from. Or an empty array if none exist.

For example, given the Layouts and URLs below, the returned segments would be:

| Layout                    | Visited URL           | Returned Segments           |
| ------------------------- | --------------------- | --------------------------- |
| `app/layout.js`           | `/`                   | `[]`                        |
| `app/layout.js`           | `/dashboard`          | `['dashboard']`             |
| `app/layout.js`           | `/dashboard/settings` | `['dashboard', 'settings']` |
| `app/dashboard/layout.js` | `/dashboard`          | `[]`                        |
| `app/dashboard/layout.js` | `/dashboard/settings` | `['settings']`              |

For catch-all routes (`[...slug]`), all matched path segments are returned as a single joined string within the array:

| Layout               | Visited URL   | Returned Segments   |
| -------------------- | ------------- | ------------------- |
| `app/layout.js`      | `/blog/a/b/c` | `['blog', 'a/b/c']` |
| `app/blog/layout.js` | `/blog/a/b/c` | `['a/b/c']`         |

## Behavior

### Cache Components

When [`cacheComponents`](/docs/app/api-reference/config/next-config-js/cacheComponents) is enabled, `useSelectedLayoutSegments` may require a [`Suspense`](https://react.dev/reference/react/Suspense) boundary. This depends on whether the active segments can be resolved during prerendering.

- **Static routes and routes with [`generateStaticParams`](/docs/app/api-reference/functions/generate-static-params)**: every route segment, including dynamic params, is known at build time. The active segments can be resolved during prerendering, so `useSelectedLayoutSegments` resolves on the server and no `Suspense` boundary is required.
- **Routes with dynamic params not covered by `generateStaticParams`**: the param is a [fallback param](/docs/app/api-reference/functions/generate-static-params#all-paths-at-build-time) that is not known until request time. The active segments cannot be resolved during prerendering, so `useSelectedLayoutSegments` suspends. Wrap the component (or a parent) in a `Suspense` boundary so its fallback can be rendered during prerendering; otherwise, the build fails.

This applies even when the component that calls `useSelectedLayoutSegments` is itself static. For example, a breadcrumb component rendered in a parent layout suspends on any page below it that has an unknown dynamic param. To keep the rest of the layout prerendered, wrap the component that calls `useSelectedLayoutSegments` (or a parent) in a `Suspense` boundary with a fallback.

See [Next.js encountered URL data in a Client Component outside of Suspense](/docs/messages/blocking-prerender-client-hook) for full fix options and trade-offs.

## Version History

| Version   | Changes                                 |
| --------- | --------------------------------------- |
| `v13.0.0` | `useSelectedLayoutSegments` introduced. |
