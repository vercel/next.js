---
title: useOffline
description: API Reference for the useOffline hook.
version: experimental
related:
  links:
    - app/api-reference/config/next-config-js/useOffline
    - app/guides/progressive-web-apps
---

The `useOffline` hook returns a boolean indicating whether the app is currently offline. Use it to render connectivity-aware UI, such as a banner when the user loses their network connection, or an offline-aware Suspense fallback.

The hook is one piece of a larger feature. Enabling the [`experimental.useOffline`](/docs/app/api-reference/config/next-config-js/useOffline) config option turns on offline connectivity detection and automatic retry of blocked navigation, prefetch, and Server Action requests, and exposes this hook so Client Components can read the state.

Without the flag, this hook always returns `false`.

```js filename="next.config.js"
module.exports = {
  experimental: {
    useOffline: true,
  },
}
```

```tsx filename="app/offline-status.tsx" switcher
'use client'

import { useOffline } from 'next/offline'

export function OfflineStatus() {
  const isOffline = useOffline()
  return <div>{isOffline ? 'Offline' : 'Online'}</div>
}
```

```jsx filename="app/offline-status.js" switcher
'use client'

import { useOffline } from 'next/offline'

export function OfflineStatus() {
  const isOffline = useOffline()
  return <div>{isOffline ? 'Offline' : 'Online'}</div>
}
```

For details on how connectivity is detected and requests retried, see [How retry works](/docs/app/api-reference/config/next-config-js/useOffline#how-retry-works).

## Parameters

```tsx
const isOffline = useOffline()
```

`useOffline` does not take any parameters.

## Returns

`useOffline` returns a `boolean`:

| Value   | Meaning                                                                                                   |
| ------- | --------------------------------------------------------------------------------------------------------- |
| `true`  | The app is offline. A network request has failed, or the browser has fired an `offline` event.            |
| `false` | The app is online, or rendering on the server. This is also the initial value before hydration completes. |

## Examples

### Show an offline banner

Render a persistent banner whenever the user loses connectivity.

```tsx filename="app/components/offline-banner.tsx" switcher
'use client'

import { useOffline } from 'next/offline'

export function OfflineBanner() {
  const isOffline = useOffline()

  if (!isOffline) {
    return null
  }

  return (
    <div role="status" className="offline-banner">
      You are offline. Some content may be unavailable.
    </div>
  )
}
```

```jsx filename="app/components/offline-banner.js" switcher
'use client'

import { useOffline } from 'next/offline'

export function OfflineBanner() {
  const isOffline = useOffline()

  if (!isOffline) {
    return null
  }

  return (
    <div role="status" className="offline-banner">
      You are offline. Some content may be unavailable.
    </div>
  )
}
```

Render it in the root layout so the banner shows on every route:

```tsx filename="app/layout.tsx" switcher
import { OfflineBanner } from './components/offline-banner'

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

```jsx filename="app/layout.js" switcher
import { OfflineBanner } from './components/offline-banner'

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

### Offline-aware Suspense fallback

When a user navigates to a route while offline, the prefetched static shell renders immediately but the dynamic content behind a `<Suspense>` boundary blocks on the network. For example, use `useOffline` inside a [`loading.tsx`](/docs/app/api-reference/file-conventions/loading) file to explain why the content is taking longer than expected.

```tsx filename="app/destination/loading.tsx" switcher
'use client'

import { useOffline } from 'next/offline'

export default function Loading() {
  const isOffline = useOffline()

  return (
    <div>
      {isOffline ? 'Waiting for connection to load this page...' : 'Loading...'}
    </div>
  )
}
```

```jsx filename="app/destination/loading.js" switcher
'use client'

import { useOffline } from 'next/offline'

export default function Loading() {
  const isOffline = useOffline()

  return (
    <div>
      {isOffline ? 'Waiting for connection to load this page...' : 'Loading...'}
    </div>
  )
}
```

When connectivity is restored, Next.js retries the blocked request and the dynamic content streams in automatically.

## Version History

| Version   | Changes                       |
| --------- | ----------------------------- |
| `v16.x.0` | `useOffline` hook introduced. |
