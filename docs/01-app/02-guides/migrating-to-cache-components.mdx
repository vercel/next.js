---
title: Migrating to Cache Components
nav_title: Migrating to Cache Components
description: Learn how to migrate from route segment configs to Cache Components in Next.js.
related:
  title: Next Steps
  description: Learn about other behavior changes when Cache Components is enabled.
  links:
    - app/guides/preserving-ui-state
    - app/api-reference/config/next-config-js/cacheComponents
---

When [Cache Components](/docs/app/api-reference/config/next-config-js/cacheComponents) is enabled, route segment configs like `dynamic`, `revalidate`, and `fetchCache` are replaced by [`use cache`](/docs/app/api-reference/directives/use-cache) and [`cacheLife`](/docs/app/api-reference/functions/cacheLife).

## `dynamic = "force-dynamic"`

**Not needed.** All pages are dynamic by default.

```tsx filename="app/page.tsx" switcher
// Before - No longer needed
export const dynamic = 'force-dynamic'

export default function Page() {
  return <div>...</div>
}
```

```jsx filename="app/page.js" switcher
// Before - No longer needed
export const dynamic = 'force-dynamic'

export default function Page() {
  return <div>...</div>
}
```

```tsx filename="app/page.tsx" switcher
// After - Just remove it
export default function Page() {
  return <div>...</div>
}
```

```jsx filename="app/page.js" switcher
// After - Just remove it
export default function Page() {
  return <div>...</div>
}
```

## `dynamic = "force-static"`

Start by removing it. When unhandled uncached or runtime data access is detected during development and build time, Next.js raises an error. Otherwise, the prerendering step automatically extracts the static HTML shell.

For uncached data access, add [`use cache`](/docs/app/api-reference/directives/use-cache) as close to the data access as possible with a long [`cacheLife`](/docs/app/api-reference/functions/cacheLife) like `'max'` to maintain cached behavior. If needed, add it at the top of the page or layout.

For runtime data access (`cookies()`, `headers()`, etc.), errors will direct you to wrap it with `<Suspense>`. Since you started by using `force-static`, you must remove the runtime data access to prevent any request time work.

```tsx filename="app/page.tsx" switcher
// Before
export const dynamic = 'force-static'

export default async function Page() {
  const data = await fetch('https://api.example.com/data')
  return <div>...</div>
}
```

```jsx filename="app/page.js" switcher
// Before
export const dynamic = 'force-static'

export default async function Page() {
  const data = await fetch('https://api.example.com/data')
  return <div>...</div>
}
```

```tsx filename="app/page.tsx" switcher
import { cacheLife } from 'next/cache'

// After - Use 'use cache' instead
export default async function Page() {
  'use cache'
  cacheLife('max')
  const data = await fetch('https://api.example.com/data')
  return <div>...</div>
}
```

```jsx filename="app/page.js" switcher
import { cacheLife } from 'next/cache'

// After - Use 'use cache' instead
export default async function Page() {
  'use cache'
  cacheLife('max')
  const data = await fetch('https://api.example.com/data')
  return <div>...</div>
}
```

## `revalidate`

**Replace with `cacheLife`.** Use the `cacheLife` function to define cache duration instead of the route segment config.

```tsx filename="app/page.tsx" switcher
// Before
export const revalidate = 3600 // 1 hour

export default async function Page() {
  return <div>...</div>
}
```

```jsx filename="app/page.js" switcher
// Before
export const revalidate = 3600 // 1 hour

export default async function Page() {
  return <div>...</div>
}
```

```tsx filename="app/page.tsx" switcher
// After - Use cacheLife
import { cacheLife } from 'next/cache'

export default async function Page() {
  'use cache'
  cacheLife('hours')
  return <div>...</div>
}
```

```jsx filename="app/page.js" switcher
// After - Use cacheLife
import { cacheLife } from 'next/cache'

export default async function Page() {
  'use cache'
  cacheLife('hours')
  return <div>...</div>
}
```

## `fetchCache`

**Not needed.** With `use cache`, all data fetching within a cached scope is automatically cached, making `fetchCache` unnecessary.

```tsx filename="app/page.tsx" switcher
// Before
export const fetchCache = 'force-cache'
```

```jsx filename="app/page.js" switcher
// Before
export const fetchCache = 'force-cache'
```

```tsx filename="app/page.tsx" switcher
// After - Use 'use cache' to control caching behavior
export default async function Page() {
  'use cache'
  // All fetches here are cached
  return <div>...</div>
}
```

```jsx filename="app/page.js" switcher
// After - Use 'use cache' to control caching behavior
export default async function Page() {
  'use cache'
  // All fetches here are cached
  return <div>...</div>
}
```

## `runtime = 'edge'`

**Not supported.** Cache Components requires the Node.js runtime. Switch to the Node.js runtime (the default) by removing the [deprecated](/docs/messages/edge-runtime-deprecated) `runtime = 'edge'` export. If you need edge behavior for specific routes, use [Proxy](/docs/app/api-reference/file-conventions/proxy) instead.

## UI state preservation

**Component state now persists across navigations.** With Cache Components, Next.js preserves routes using React's [`<Activity>`](https://react.dev/reference/react/Activity) component in [`"hidden"`](https://react.dev/reference/react/Activity#activity) mode instead of unmounting them. Effects clean up and re-run normally, but `useState` values, form inputs, and scroll position are no longer reset when navigating away and back.

If your code relied on unmounting to clear state, you may need to add explicit reset logic:

- **Dropdowns and popovers** — stay open when navigating back. Close them in a `useLayoutEffect` cleanup function.
- **Dialogs with initialization logic** — Effects that depend on dialog state (like focusing an input) won't re-fire if the state was preserved. Derive dialog state from the URL instead.
- **Forms after submission** — input values and `useActionState` results (success/error messages) persist when returning. Reset in the submit handler or user action when possible, otherwise use a cleanup effect.

See [Preserving UI state across navigations](/docs/app/guides/preserving-ui-state) for detailed examples of each pattern.
