---
title: usePathname
description: API Reference for the usePathname hook.
---

`usePathname` is a **Client Component** hook that lets you read the current URL's **pathname**.

> **Good to know**: When [`cacheComponents`](/docs/app/api-reference/config/next-config-js/cacheComponents) is enabled `usePathname` may require a `Suspense` boundary around it if your route has a dynamic param. If you use `generateStaticParams` the `Suspense` boundary is optional

```tsx filename="app/example-client-component.tsx" switcher
'use client'

import { usePathname } from 'next/navigation'

export default function ExampleClientComponent() {
  const pathname = usePathname()
  return <p>Current pathname: {pathname}</p>
}
```

```jsx filename="app/example-client-component.js" switcher
'use client'

import { usePathname } from 'next/navigation'

export default function ExampleClientComponent() {
  const pathname = usePathname()
  return <p>Current pathname: {pathname}</p>
}
```

`usePathname` intentionally requires using a [Client Component](/docs/app/getting-started/server-and-client-components). It's important to note Client Components are not a de-optimization. They are an integral part of the [Server Components](/docs/app/getting-started/server-and-client-components) architecture.

For example, a Client Component with `usePathname` will be rendered into HTML on the initial page load. When navigating to a new route, this component does not need to be re-fetched. Instead, the component is downloaded once (in the client JavaScript bundle), and re-renders based on the current state.

> **Good to know**:
>
> - Reading the current URL from a [Server Component](/docs/app/getting-started/server-and-client-components) is not supported. This design is intentional to support layout state being preserved across page navigations.
> - If your page is being statically pre-rendered and your app has [rewrites](/docs/app/api-reference/config/next-config-js/rewrites) in `next.config` or a [Proxy](/docs/app/api-reference/file-conventions/proxy) file, reading the pathname with `usePathname()` can result in hydration mismatch errors—because the initial value comes from the server and may not match the actual browser pathname after routing. See our [example](#avoid-hydration-mismatch-with-rewrites) for a way to mitigate this issue.

<details>

<summary>Compatibility with Pages Router</summary>

If you have components that use `usePathname` and they are imported into routes within the Pages Router, be aware that `usePathname` may return `null` if the router is not yet initialized. This can occur in cases such as [fallback routes](/docs/pages/api-reference/functions/get-static-paths#fallback-true) or during [Automatic Static Optimization](https://nextjs.org/docs/pages/building-your-application/rendering/static#automatic-static-optimization) in the Pages Router.

To enhance compatibility between routing systems, if your project contains both an `app` and a `pages` directory, Next.js will automatically adjust the return type of `usePathname`.

</details>

## Parameters

```tsx
const pathname = usePathname()
```

`usePathname` does not take any parameters.

## Returns

`usePathname` returns a string of the current URL's pathname. For example:

| URL                 | Returned value        |
| ------------------- | --------------------- |
| `/`                 | `'/'`                 |
| `/dashboard`        | `'/dashboard'`        |
| `/dashboard?v=2`    | `'/dashboard'`        |
| `/blog/hello-world` | `'/blog/hello-world'` |

## Examples

### Do something in response to a route change

```tsx filename="app/example-client-component.tsx" switcher
'use client'

import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

function ExampleClientComponent() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  useEffect(() => {
    // Do something here...
  }, [pathname, searchParams])
}
```

```jsx filename="app/example-client-component.js" switcher
'use client'

import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

function ExampleClientComponent() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  useEffect(() => {
    // Do something here...
  }, [pathname, searchParams])
}
```

### Avoid hydration mismatch with rewrites

When a page is pre-rendered, the HTML is generated for the source pathname. If the page is then reached through a rewrite using `next.config` or `Proxy`, the browser URL may differ, and `usePathname()` will read the rewritten pathname on the client.

To avoid hydration mismatches, design the UI so that only a small, isolated part depends on the client pathname. Render a stable fallback on the server and update that part after mount.

```tsx filename="app/example-client-component.tsx" switcher
'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

export default function PathnameBadge() {
  const pathname = usePathname()
  const [clientPathname, setClientPathname] = useState('')

  useEffect(() => {
    setClientPathname(pathname)
  }, [pathname])

  return (
    <p>
      Current pathname: <span>{clientPathname}</span>
    </p>
  )
}
```

```jsx filename="app/example-client-component.js" switcher
'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

export default function PathnameBadge() {
  const pathname = usePathname()
  const [clientPathname, setClientPathname] = useState('')

  useEffect(() => {
    setClientPathname(pathname)
  }, [pathname])

  return (
    <p>
      Current pathname: <span>{clientPathname}</span>
    </p>
  )
}
```

| Version   | Changes                   |
| --------- | ------------------------- |
| `v13.0.0` | `usePathname` introduced. |
