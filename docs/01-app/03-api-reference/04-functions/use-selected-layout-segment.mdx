---
title: useSelectedLayoutSegment
description: API Reference for the useSelectedLayoutSegment hook.
---

`useSelectedLayoutSegment` is a **Client Component** hook that lets you read the active route segment **one level below** the Layout it is called from.

It is useful for navigation UI, such as tabs inside a parent layout that change style depending on the active child segment.

```tsx filename="app/example-client-component.tsx" switcher
'use client'

import { useSelectedLayoutSegment } from 'next/navigation'

export default function ExampleClientComponent() {
  const segment = useSelectedLayoutSegment()

  return <p>Active segment: {segment}</p>
}
```

```jsx filename="app/example-client-component.js" switcher
'use client'

import { useSelectedLayoutSegment } from 'next/navigation'

export default function ExampleClientComponent() {
  const segment = useSelectedLayoutSegment()

  return <p>Active segment: {segment}</p>
}
```

> **Good to know**:
>
> - Since `useSelectedLayoutSegment` is a [Client Component](/docs/app/getting-started/server-and-client-components) hook, and Layouts are [Server Components](/docs/app/getting-started/server-and-client-components) by default, `useSelectedLayoutSegment` is usually called via a Client Component that is imported into a Layout.
> - `useSelectedLayoutSegment` only returns the segment one level down. To return all active segments, see [`useSelectedLayoutSegments`](/docs/app/api-reference/functions/use-selected-layout-segments)
> - For [catch-all](/docs/app/api-reference/file-conventions/dynamic-routes#catch-all-segments) routes, the matched segments are returned as a single joined string. For example, given `app/blog/[...slug]/page.js`, calling from `app/blog/layout.js` when visiting `/blog/a/b/c` returns `'a/b/c'`.

## Parameters

```tsx
const segment = useSelectedLayoutSegment(parallelRoutesKey?: string)
```

`useSelectedLayoutSegment` _optionally_ accepts a [`parallelRoutesKey`](/docs/app/api-reference/file-conventions/parallel-routes#with-useselectedlayoutsegments), which allows you to read the active route segment within that slot.

## Returns

`useSelectedLayoutSegment` returns a string of the active segment or `null` if one doesn't exist.

For example, given the Layouts and URLs below, the returned segment would be:

| Layout                    | Visited URL                    | Returned Segment |
| ------------------------- | ------------------------------ | ---------------- |
| `app/layout.js`           | `/`                            | `null`           |
| `app/layout.js`           | `/dashboard`                   | `'dashboard'`    |
| `app/dashboard/layout.js` | `/dashboard`                   | `null`           |
| `app/dashboard/layout.js` | `/dashboard/settings`          | `'settings'`     |
| `app/dashboard/layout.js` | `/dashboard/analytics`         | `'analytics'`    |
| `app/dashboard/layout.js` | `/dashboard/analytics/monthly` | `'analytics'`    |

For catch-all routes (`[...slug]`), the returned segment contains all matched path segments joined as a single string:

| Layout               | Visited URL   | Returned Segment |
| -------------------- | ------------- | ---------------- |
| `app/blog/layout.js` | `/blog/a/b/c` | `'a/b/c'`        |

## Behavior

### Cache Components

When [`cacheComponents`](/docs/app/api-reference/config/next-config-js/cacheComponents) is enabled, `useSelectedLayoutSegment` may require a [`Suspense`](https://react.dev/reference/react/Suspense) boundary. This depends on whether the active segment can be resolved during prerendering.

- **Static routes and routes with [`generateStaticParams`](/docs/app/api-reference/functions/generate-static-params)**: every route segment, including dynamic params, is known at build time. The active segment can be resolved during prerendering, so `useSelectedLayoutSegment` resolves on the server and no `Suspense` boundary is required.
- **Routes with dynamic params not covered by `generateStaticParams`**: the param is a [fallback param](/docs/app/api-reference/functions/generate-static-params#all-paths-at-build-time) that is not known until request time. The active segment cannot be resolved during prerendering, so `useSelectedLayoutSegment` suspends. Wrap the component (or a parent) in a `Suspense` boundary so its fallback can be rendered during prerendering; otherwise, the build fails.

This applies even when the component that calls `useSelectedLayoutSegment` is itself static. For example, a tab bar rendered in a parent layout suspends on any page below it that has an unknown dynamic param. To keep the rest of the layout prerendered, wrap the component that calls `useSelectedLayoutSegment` (or a parent) in a `Suspense` boundary with a fallback.

See [Next.js encountered URL data in a Client Component outside of Suspense](/docs/messages/blocking-prerender-client-hook) for full fix options and trade-offs.

## Examples

### Creating an active link component

You can use `useSelectedLayoutSegment` to create an active link component that changes style depending on the active segment. For example, a featured posts list in the sidebar of a blog:

```tsx filename="app/blog/blog-nav-link.tsx" switcher
'use client'

import Link from 'next/link'
import { useSelectedLayoutSegment } from 'next/navigation'

// This *client* component will be imported into a blog layout
export default function BlogNavLink({
  slug,
  children,
}: {
  slug: string
  children: React.ReactNode
}) {
  // Navigating to `/blog/hello-world` will return 'hello-world'
  // for the selected layout segment
  const segment = useSelectedLayoutSegment()
  const isActive = slug === segment

  return (
    <Link
      href={`/blog/${slug}`}
      // Change style depending on whether the link is active
      style={{ fontWeight: isActive ? 'bold' : 'normal' }}
    >
      {children}
    </Link>
  )
}
```

```jsx filename="app/blog/blog-nav-link.js" switcher
'use client'

import Link from 'next/link'
import { useSelectedLayoutSegment } from 'next/navigation'

// This *client* component will be imported into a blog layout
export default function BlogNavLink({ slug, children }) {
  // Navigating to `/blog/hello-world` will return 'hello-world'
  // for the selected layout segment
  const segment = useSelectedLayoutSegment()
  const isActive = slug === segment

  return (
    <Link
      href={`/blog/${slug}`}
      // Change style depending on whether the link is active
      style={{ fontWeight: isActive ? 'bold' : 'normal' }}
    >
      {children}
    </Link>
  )
}
```

```tsx filename="app/blog/layout.tsx" switcher
// Import the Client Component into a parent Layout (Server Component)
import { BlogNavLink } from './blog-nav-link'
import getFeaturedPosts from './get-featured-posts'

export default async function Layout({
  children,
}: {
  children: React.ReactNode
}) {
  const featuredPosts = await getFeaturedPosts()
  return (
    <div>
      {featuredPosts.map((post) => (
        <div key={post.id}>
          <BlogNavLink slug={post.slug}>{post.title}</BlogNavLink>
        </div>
      ))}
      <div>{children}</div>
    </div>
  )
}
```

```jsx filename="app/blog/layout.js" switcher
// Import the Client Component into a parent Layout (Server Component)
import { BlogNavLink } from './blog-nav-link'
import getFeaturedPosts from './get-featured-posts'

export default async function Layout({ children }) {
  const featuredPosts = await getFeaturedPosts()
  return (
    <div>
      {featuredPosts.map((post) => (
        <div key={post.id}>
          <BlogNavLink slug={post.slug}>{post.title}</BlogNavLink>
        </div>
      ))}
      <div>{children}</div>
    </div>
  )
}
```

## Version History

| Version   | Changes                                |
| --------- | -------------------------------------- |
| `v13.0.0` | `useSelectedLayoutSegment` introduced. |
