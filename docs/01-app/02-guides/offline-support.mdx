---
title: Handling connectivity drops
description: How a Next.js app can recover when the network drops mid-fetch or mid-Server Action, and how to communicate that state to the user.
nav_title: Offline support
version: experimental
related:
  title: Learn more
  description: The hook and config flag used in this guide.
  links:
    - app/api-reference/functions/use-offline
    - app/api-reference/config/next-config-js/useOffline
    - app/guides/progressive-web-apps
---

Network failures during a soft navigation, a data fetch, or a mutation throw errors in the client. Without explicit handling, the UI either breaks or you have to build a fallback UI that asks the user to retry.

With [`experimental.useOffline`](/docs/app/api-reference/config/next-config-js/useOffline) enabled, a failed navigation, RSC data fetch, prefetch, or Server Action no longer throws when the network is down. Next.js keeps it pending and retries it once the connection returns.

While the request is pending, the UI sits in its loading state (a Suspense fallback, or a pending transition for a Server Action), which looks the same as a slow server. Use the [`useOffline`](/docs/app/api-reference/functions/use-offline) hook to give users feedback when the app is offline.

Requests you issue directly with `fetch()` inside a Client Component, or through a client-side data library like React Query or SWR, stay under that library's own retry policy. See [How retry works](/docs/app/api-reference/config/next-config-js/useOffline#how-retry-works) for the framework's detection and polling behavior.

## Example

We will build a live-metrics page that fetches fresh data on every request, plus a ping form that calls a Server Action.

- Source: [github.com/vercel-labs/use-offline](https://github.com/vercel-labs/use-offline)
- Live demo: [use-offline.labs.vercel.dev](https://use-offline.labs.vercel.dev)

The companion demo has two versions of this dashboard: `/without-feedback` uses a generic loading fallback, `/with-feedback` uses a connectivity-aware one. The next sections of this guide walk through building each.

## Enable offline detection and see the default behavior

Turn on `experimental.useOffline`. This guide also enables [Cache Components](/docs/app/api-reference/config/next-config-js/cacheComponents) and [Partial Prefetching](/docs/app/api-reference/config/next-config-js/partialPrefetching). Cache Components lets you place the Suspense boundary as close as possible to the uncached data, with the [App Shell](/docs/app/glossary#app-shell) rendered around it. Partial Prefetching makes that App Shell the unit a `<Link>` prefetches, so it is ready to render when a navigation happens offline.

Without Cache Components, a route-level [`loading.tsx`](/docs/app/api-reference/file-conventions/loading) gives you the same offline behavior at the segment level. See [Without Cache Components](#without-cache-components) below.

```ts filename="next.config.ts" switcher
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    useOffline: true,
  },
}

export default nextConfig
```

```js filename="next.config.js" switcher
module.exports = {
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    useOffline: true,
  },
}
```

You also need a source page with a `<Link>` to the dashboard. Next.js prefetches the App Shell of any `<Link>` that enters the viewport, and that prefetch is what makes the shell available offline.

```tsx filename="app/page.tsx" switcher
import Link from 'next/link'

export default function Home() {
  return (
    <nav>
      <Link href="/dashboard">Dashboard</Link>
    </nav>
  )
}
```

```jsx filename="app/page.js" switcher
import Link from 'next/link'

export default function Home() {
  return (
    <nav>
      <Link href="/dashboard">Dashboard</Link>
    </nav>
  )
}
```

Then build the dashboard itself: a static shell and an uncached data section inside a `<Suspense>` boundary. `getLiveMetrics` is an uncached function that makes a fetch request to an endpoint; every call hits the network.

```tsx filename="app/dashboard/page.tsx" switcher
import { Suspense } from 'react'
import { getLiveMetrics } from '../lib/data'

export default function Dashboard() {
  return (
    <section>
      <h1>Live metrics</h1>
      <Suspense fallback={<p>Loading...</p>}>
        <MetricsTable />
      </Suspense>
    </section>
  )
}

async function MetricsTable() {
  const { services } = await getLiveMetrics()
  // render services
}
```

```jsx filename="app/dashboard/page.js" switcher
import { Suspense } from 'react'
import { getLiveMetrics } from '../lib/data'

export default function Dashboard() {
  return (
    <section>
      <h1>Live metrics</h1>
      <Suspense fallback={<p>Loading...</p>}>
        <MetricsTable />
      </Suspense>
    </section>
  )
}

async function MetricsTable() {
  const { services } = await getLiveMetrics()
  // render services
}
```

Load the home page. With the `<Link>` in the viewport, the dashboard's static shell is prefetched. Go offline (see [Testing](#testing) below) and click through to `/dashboard`.

The title and container render from the static shell. The `Loading...` fallback stays on screen indefinitely because the uncached `getLiveMetrics()` call cannot complete. The user sees the same spinner they would see for a slow server.

Toggle back to **Online**. The metrics table streams in automatically. Next.js retried the request on its own, no client code involved.

> [!NOTE]
> This feature only applies to soft navigations into prefetched routes and Server Action calls from the current page. A full page reload while offline still fails because the browser needs the network to deliver the HTML; full offline loads would need a service worker (see the [Progressive Web Apps](/docs/app/guides/progressive-web-apps) guide).

Next, replace the generic fallback UI with one that reads the connectivity state.

## Report connectivity inside the Suspense fallback

`useOffline` returns `true` when the browser fires an `offline` event **or** when a navigation, prefetch, or Server Action fetch fails. It flips back to `false` when a background connectivity check succeeds. This is more reliable than `navigator.onLine`, which only reflects the OS network interface and still reports `true` for a device on WiFi with no upstream internet.

Create a client component that picks its message based on the hook.

```tsx filename="app/dashboard/connectivity-fallback.tsx" switcher
'use client'

import { useOffline } from 'next/offline'

export function ConnectivityFallback() {
  const isOffline = useOffline()

  return (
    <p>
      {isOffline
        ? 'Waiting for connection to load this section...'
        : 'Loading...'}
    </p>
  )
}
```

```jsx filename="app/dashboard/connectivity-fallback.js" switcher
'use client'

import { useOffline } from 'next/offline'

export function ConnectivityFallback() {
  const isOffline = useOffline()

  return (
    <p>
      {isOffline
        ? 'Waiting for connection to load this section...'
        : 'Loading...'}
    </p>
  )
}
```

> [!NOTE]
> `useOffline` returns `false` during server-side rendering and initial hydration. The first accurate value is whatever the browser reports after the app mounts.

Pass it as the Suspense fallback.

```tsx filename="app/dashboard/page.tsx" highlight={3,9} switcher
import { Suspense } from 'react'
import { getLiveMetrics } from '../lib/data'
import { ConnectivityFallback } from './connectivity-fallback'

export default function Dashboard() {
  return (
    <section>
      <h1>Live metrics</h1>
      <Suspense fallback={<ConnectivityFallback />}>
        <MetricsTable />
      </Suspense>
    </section>
  )
}
```

```jsx filename="app/dashboard/page.js" highlight={3,9} switcher
import { Suspense } from 'react'
import { getLiveMetrics } from '../lib/data'
import { ConnectivityFallback } from './connectivity-fallback'

export default function Dashboard() {
  return (
    <section>
      <h1>Live metrics</h1>
      <Suspense fallback={<ConnectivityFallback />}>
        <MetricsTable />
      </Suspense>
    </section>
  )
}
```

Navigating to the dashboard while offline, the fallback now reads "Waiting for connection to load this section..." Restore connectivity and the metrics stream in as the fallback disappears.

The fallback only shows on this page, and only while its Suspense boundary is waiting. In this app, we add a banner in the root layout so connectivity state is visible everywhere.

```tsx filename="app/offline-banner.tsx" switcher
'use client'

import { useOffline } from 'next/offline'

export function OfflineBanner() {
  const isOffline = useOffline()

  if (!isOffline) {
    return null
  }

  return (
    <div role="status">
      Offline. Pending requests will retry once you are back online.
    </div>
  )
}
```

```jsx filename="app/offline-banner.js" switcher
'use client'

import { useOffline } from 'next/offline'

export function OfflineBanner() {
  const isOffline = useOffline()

  if (!isOffline) {
    return null
  }

  return (
    <div role="status">
      Offline. Pending requests will retry once you are back online.
    </div>
  )
}
```

Add it to the root layout.

```tsx filename="app/layout.tsx" highlight={1,7} switcher
import { OfflineBanner } from './offline-banner'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html>
      <body>
        <OfflineBanner />
        {children}
      </body>
    </html>
  )
}
```

```jsx filename="app/layout.js" highlight={1,7} switcher
import { OfflineBanner } from './offline-banner'

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <OfflineBanner />
        {children}
      </body>
    </html>
  )
}
```

The banner shows on every route while offline, and hides when connectivity returns.

For most apps, the pending loading state is enough. Add a banner in the root layout to communicate the connectivity state across the app. To surface that state right where the content is loading, make the route's Suspense fallback itself offline-aware with `useOffline`.

The same pattern extends to parameterized routes. A route like `/chats/[id]` renders its shared [App Shell](/docs/app/glossary#app-shell) when you navigate to `/chats/42` offline, and the dynamic messages behind its `<Suspense>` boundary load when the connection returns.

If the route also prefetches its per-link URL data ahead of the click, `/chats/42` renders its messages from that prefetch immediately, even offline, instead of waiting for the connection to return. See [runtime prefetching](/docs/app/guides/runtime-prefetching) to learn more.

## Retry Server Actions after the network returns

Without the flag, a Server Action called with no network throws a fetch error and the awaited promise rejects. Your form has to catch the rejection and decide what to do: show an error, retry, or queue it somewhere.

With `experimental.useOffline` enabled, that failure never reaches your code. The call stays pending until the connection returns, the request runs again, and the awaited promise resolves with the server's response. No try/catch, no retry loop, no reconnection handler in the component.

The button is still going to sit there looking frozen, though. Combine `useTransition` with `useOffline` to give it an offline-aware label.

```ts filename="app/ping/actions.ts" switcher
'use server'

export async function ping(): Promise<string> {
  return new Date().toISOString()
}
```

```js filename="app/ping/actions.js" switcher
'use server'

export async function ping() {
  return new Date().toISOString()
}
```

```tsx filename="app/ping/ping-form.tsx" switcher
'use client'

import { useState, useTransition } from 'react'
import { useOffline } from 'next/offline'
import { ping } from './actions'

export function PingForm() {
  const [pongs, setPongs] = useState<string[]>([])
  const [pending, startTransition] = useTransition()
  const isOffline = useOffline()

  function handleSubmit() {
    startTransition(async () => {
      const pong = await ping()
      setPongs((prev) => [pong, ...prev])
    })
  }

  const label = pending
    ? isOffline
      ? 'Pinging (offline, will retry)...'
      : 'Pinging...'
    : 'Ping'

  return (
    <form action={handleSubmit}>
      <button type="submit" disabled={pending}>
        {label}
      </button>
      <ul>
        {pongs.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </form>
  )
}
```

```jsx filename="app/ping/ping-form.js" switcher
'use client'

import { useState, useTransition } from 'react'
import { useOffline } from 'next/offline'
import { ping } from './actions'

export function PingForm() {
  const [pongs, setPongs] = useState([])
  const [pending, startTransition] = useTransition()
  const isOffline = useOffline()

  function handleSubmit() {
    startTransition(async () => {
      const pong = await ping()
      setPongs((prev) => [pong, ...prev])
    })
  }

  const label = pending
    ? isOffline
      ? 'Pinging (offline, will retry)...'
      : 'Pinging...'
    : 'Ping'

  return (
    <form action={handleSubmit}>
      <button type="submit" disabled={pending}>
        {label}
      </button>
      <ul>
        {pongs.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </form>
  )
}
```

Clicking **Ping** while offline disables the button and changes its label to "Pinging (offline, will retry)...". Restoring connectivity resolves the awaited `ping()` call, appends the timestamp to the list, and reverts the label to "Ping". No second click, no client-side retry code.

> [!NOTE]
> While offline, clicking a link during a pending Server Action may appear to do nothing. The link's navigation also needs the network and queues behind the same connectivity signal as the action. Both resolve when the connection returns.

## Testing

Test this feature with `next build && next start`. Dev mode is not a reliable reference for offline behavior.

In Chrome, use [DevTools > Network > **Offline**](https://developer.chrome.com/docs/devtools/network/reference#offline); in Firefox, use the [Network Monitor's throttling menu](https://firefox-source-docs.mozilla.org/devtools-user/network_monitor/throttling/index.html). For a real-world test, toggle airplane mode on your laptop or phone, disconnect WiFi, or unplug the network cable.

## Without Cache Components

A route-level [`loading.tsx`](/docs/app/api-reference/file-conventions/loading) does the same job. It gives Next.js a boundary to prefetch as the route's shell, so the shell renders offline and the page resumes once the network returns. For how `loading.tsx` prefetching works, see [Prefetching](/docs/app/guides/prefetching). The `useOffline` hook, banner, and Server Action retry all behave the same way.

## Next steps

- [`useOffline` hook reference](/docs/app/api-reference/functions/use-offline)
- [`experimental.useOffline` config reference](/docs/app/api-reference/config/next-config-js/useOffline)
- [`loading.tsx` file convention](/docs/app/api-reference/file-conventions/loading)
- [Progressive Web Apps guide](/docs/app/guides/progressive-web-apps) for service-worker-based offline caching
