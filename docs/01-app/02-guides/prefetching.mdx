---
title: Prefetching
description: Learn how to configure prefetching in Next.js
---

Prefetching makes navigating between routes feel instant. By default, Next.js prefetches routes based on the links in your application code.

This guide explains how prefetching works, what Next.js prefetches for you, and how to control it:

- [How does prefetching work?](#how-does-prefetching-work)
- [What Next.js prefetches automatically](#what-nextjs-prefetches-automatically)
- [Controlling prefetching](#controlling-prefetching)
- [Troubleshooting](#troubleshooting)

> **Using Partial Prefetching?** With [`partialPrefetching`](/docs/app/api-reference/config/next-config-js/partialPrefetching) enabled, `<Link>` defaults to prefetching a per-route [App Shell](/docs/app/glossary#app-shell) rather than the full page. See [Partial Prefetching](#partial-prefetching) below and [Adopting Partial Prefetching](/docs/app/guides/adopting-partial-prefetching) for the adoption path.

## How does prefetching work?

When navigating between routes, the browser requests assets for the page like HTML and JavaScript files. Prefetching is the process of fetching these resources _ahead_ of time, before you navigate to a new route.

Next.js automatically splits your application into smaller JavaScript chunks based on routes. Instead of loading all the code upfront like traditional SPAs, only the code needed for the current route is loaded. This reduces the initial load time while other parts of the app are loaded in the background. By the time you click the link, the resources for the new route have already been loaded into the browser cache.

When navigating to the new page, there's no full page reload or browser loading spinner. Instead, Next.js performs a [client-side transition](/docs/app/getting-started/linking-and-navigating#client-side-transitions), making the page navigation feel instant.

## What Next.js prefetches automatically

Next.js prefetches automatically in production. As each `<Link>` enters the viewport, Next.js prefetches the route behind it and schedules the work so a page full of links doesn't flood the network. How much of each route it prefetches depends on whether the route is static or dynamic, and changes when [Partial Prefetching](#partial-prefetching) is enabled.

### Prefetching static vs. dynamic routes

Without Cache Components, a static route is prefetched in full, while a dynamic route is skipped unless it has a [`loading.js`](/docs/app/api-reference/file-conventions/loading) boundary.

|                                                         | **Static page** | **Dynamic page**                                                                |
| ------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------- |
| **Prefetched**                                          | Yes, full route | No, unless [`loading.js`](/docs/app/api-reference/file-conventions/loading)     |
| [**Client Cache TTL**](/docs/app/glossary#client-cache) | 5 min (default) | Off, unless [enabled](/docs/app/api-reference/config/next-config-js/staleTimes) |
| **Server roundtrip on click**                           | No              | Yes, streamed after [shell](/docs/app/getting-started/caching)                  |

> **Good to know:** During the initial navigation, the browser fetches the HTML, JavaScript, and React Server Components (RSC) Payload. For subsequent navigations, the browser will fetch the RSC Payload for Server Components and JS bundle for Client Components.

### Automatic prefetch

```tsx filename="app/ui/nav-link.tsx" switcher
import Link from 'next/link'

export default function NavLink() {
  return <Link href="/about">About</Link>
}
```

```jsx filename="app/ui/nav-link.js" switcher
import Link from 'next/link'

export default function NavLink() {
  return <Link href="/about">About</Link>
}
```

| **Context**       | **Prefetched payload**           | **Client Cache TTL**                                                                              |
| ----------------- | -------------------------------- | ------------------------------------------------------------------------------------------------- |
| No `loading.js`   | Entire page                      | 5 min ([`staleTimes.static`](/docs/app/api-reference/config/next-config-js/staleTimes))           |
| With `loading.js` | Layout to first loading boundary | Off by default ([`staleTimes.dynamic`](/docs/app/api-reference/config/next-config-js/staleTimes)) |

Automatic prefetching runs only in production. Disable with `prefetch={false}` or use the wrapper in [Disabled Prefetch](#disabled-prefetch).

### Prefetch scheduling

Next.js maintains a small task queue, which prefetches in the following order:

1. Links in the viewport
2. Links showing user intent (hover or touch)
3. Newer links replace older ones
4. Links scrolled off-screen are discarded

The scheduler prioritizes likely navigations while minimizing unused downloads.

> **Good to know**: With the **experimental** [`useOffline`](/docs/app/guides/offline-support) config enabled, pending prefetches resume through this queue when the app recovers from a connectivity drop.

### Client cache

Next.js stores prefetched React Server Component payloads in memory, keyed by route segments. When navigating between sibling routes (e.g. `/dashboard/settings` → `/dashboard/analytics`), Next.js reuses the parent layout and only fetches the updated leaf page.

### Partial Prefetching

With [Partial Prefetching](/docs/app/glossary#partial-prefetching) enabled via the [`partialPrefetching`](/docs/app/api-reference/config/next-config-js/partialPrefetching) config (which requires [Cache Components](/docs/app/getting-started/caching)), prefetching switches from the all-or-nothing model above to a per-route [App Shell](/docs/app/glossary#app-shell):

- **One shell per route, shared across links.** `<Link>` prefetches the route's App Shell, which holds its static and session output. Any number of links to the same route reuse that one shell, fetched once as the first link enters the viewport, so a page with many links makes fewer prefetch requests than prefetching each route in full.
- **The rest streams in.** Uncached data streams in after navigation, behind the shell's `<Suspense>` boundaries. A link can also resolve its URL data (`searchParams`, `params`) at prefetch time with [`prefetch={true}`](/docs/app/guides/optimizing-prefetching).
- **Invalidations refresh prefetches.** Data invalidations (`revalidateTag`, `revalidatePath`) silently refresh associated prefetches.

See [Adopting Partial Prefetching](/docs/app/guides/adopting-partial-prefetching) for the behavior change and the recommended adoption path. See [Optimizing prefetching](/docs/app/guides/optimizing-prefetching) to resolve cached URL-specific content before navigation with `prefetch={true}`.

## Controlling prefetching

Next.js prefetches with defaults you can tune per link when they don't fit your resource budget or navigation patterns.

### Manual prefetch

To prefetch manually, import the `useRouter` hook from `next/navigation`, then call `router.prefetch()` to warm routes outside the viewport or in response to analytics, hover, or scroll.

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { CustomLink } from '@components/link'

export function PricingCard() {
  const router = useRouter()

  return (
    <div onMouseEnter={() => router.prefetch('/pricing')}>
      {/* other UI elements */}
      <CustomLink href="/pricing">View Pricing</CustomLink>
    </div>
  )
}
```

To prefetch a URL when a component loads, see [Extending or ejecting link](#extending-or-ejecting-link).

### Hover-triggered prefetch

> **Proceed with caution:** Extending `Link` opts you into maintaining prefetching, cache invalidation, and accessibility concerns. Do this only when the defaults are insufficient.

By default, `<Link>` prefetches when it enters the viewport. To prefetch only the links a user is likely to visit, defer prefetching until they hover over a link:

```tsx
'use client'

import Link from 'next/link'
import { useState } from 'react'

export function HoverPrefetchLink({
  href,
  children,
}: {
  href: string
  children: React.ReactNode
}) {
  const [active, setActive] = useState(false)

  return (
    <Link
      href={href}
      prefetch={active ? null : false}
      onMouseEnter={() => setActive(true)}
    >
      {children}
    </Link>
  )
}
```

`prefetch={null}` restores default (static) prefetching once the user shows intent.

### Extending or ejecting link

You can extend the `<Link>` component to create your own custom prefetching strategy. For example, using the [ForesightJS](https://foresightjs.com/docs/integrations/nextjs) library which prefetches links by predicting the direction of the user's cursor.

Alternatively, you can use [`useRouter`](/docs/app/api-reference/functions/use-router) to recreate some of the native `<Link>` behavior. However, be aware this opts you into maintaining prefetching and cache invalidation.

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

function ManualPrefetchLink({
  href,
  children,
}: {
  href: string
  children: React.ReactNode
}) {
  const router = useRouter()

  useEffect(() => {
    let cancelled = false
    const poll = () => {
      if (!cancelled) router.prefetch(href, { onInvalidate: poll })
    }
    poll()
    return () => {
      cancelled = true
    }
  }, [href, router])

  return (
    <a
      href={href}
      onClick={(event) => {
        event.preventDefault()
        router.push(href)
      }}
    >
      {children}
    </a>
  )
}
```

Next.js invokes [`onInvalidate`](/docs/app/api-reference/functions/use-router#userouter) when it suspects cached data is stale, so you can refresh the prefetch.

> **Good to know:** An `a` tag triggers a full page navigation. Use `onClick` to prevent it, then call `router.push` to navigate on the client.

### Disabled prefetch

You can fully disable prefetching for certain routes for more fine-grained control over resource consumption.

```tsx
'use client'

import Link, { LinkProps } from 'next/link'

function NoPrefetchLink({
  prefetch,
  ...rest
}: LinkProps & { children: React.ReactNode }) {
  return <Link {...rest} prefetch={false} />
}
```

For example, you may still want to have consistent usage of `<Link>` in your application, but links in your footer might not need to be prefetched when entering the viewport.

## Troubleshooting

### Triggering unwanted side-effects during prefetching

If your layouts or pages are not [pure](https://react.dev/learn/keeping-components-pure#purity-components-as-formulas) and have side-effects (e.g. tracking analytics), Next.js might run them when the route is prefetched, not when the user visits the page.

To avoid this, move side-effects to a `useEffect` hook or a Server Action triggered from a Client Component.

**Before**:

```tsx filename="app/dashboard/layout.tsx" switcher
import { trackPageView } from '@/lib/analytics'

export default function Layout({ children }: { children: React.ReactNode }) {
  // This runs during prefetch
  trackPageView()

  return <div>{children}</div>
}
```

```jsx filename="app/dashboard/layout.js" switcher
import { trackPageView } from '@/lib/analytics'

export default function Layout({ children }) {
  // This runs during prefetch
  trackPageView()

  return <div>{children}</div>
}
```

**After**:

```tsx filename="app/ui/analytics-tracker.tsx" switcher
'use client'

import { useEffect } from 'react'
import { trackPageView } from '@/lib/analytics'

export function AnalyticsTracker() {
  useEffect(() => {
    trackPageView()
  }, [])

  return null
}
```

```jsx filename="app/ui/analytics-tracker.js" switcher
'use client'

import { useEffect } from 'react'
import { trackPageView } from '@/lib/analytics'

export function AnalyticsTracker() {
  useEffect(() => {
    trackPageView()
  }, [])

  return null
}
```

```tsx filename="app/dashboard/layout.tsx" switcher
import { AnalyticsTracker } from '@/app/ui/analytics-tracker'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <AnalyticsTracker />
      {children}
    </div>
  )
}
```

```jsx filename="app/dashboard/layout.js" switcher
import { AnalyticsTracker } from '@/app/ui/analytics-tracker'

export default function Layout({ children }) {
  return (
    <div>
      <AnalyticsTracker />
      {children}
    </div>
  )
}
```

### Preventing too many prefetches

Next.js automatically prefetches links in the viewport when using the `<Link>` component.

You might want to prevent this to avoid unnecessary resource usage, such as when rendering a large list of links (e.g. an infinite scroll table).

You can disable prefetching by setting the `prefetch` prop of the `<Link>` component to `false`.

```tsx filename="app/ui/no-prefetch-link.tsx" switcher
<Link prefetch={false} href={`/blog/${post.id}`}>
  {post.title}
</Link>
```

However, this means static routes will only be fetched on click, and dynamic routes will wait for the server to render before navigating.

To reduce resource usage without disabling prefetch entirely, you can defer prefetching until the user hovers over a link. This targets only links the user is likely to visit.

```tsx filename="app/ui/hover-prefetch-link.tsx" switcher
'use client'

import Link from 'next/link'
import { useState } from 'react'

export function HoverPrefetchLink({
  href,
  children,
}: {
  href: string
  children: React.ReactNode
}) {
  const [active, setActive] = useState(false)

  return (
    <Link
      href={href}
      prefetch={active ? null : false}
      onMouseEnter={() => setActive(true)}
    >
      {children}
    </Link>
  )
}
```

```jsx filename="app/ui/hover-prefetch-link.js" switcher
'use client'

import Link from 'next/link'
import { useState } from 'react'

export function HoverPrefetchLink({ href, children }) {
  const [active, setActive] = useState(false)

  return (
    <Link
      href={href}
      prefetch={active ? null : false}
      onMouseEnter={() => setActive(true)}
    >
      {children}
    </Link>
  )
}
```
