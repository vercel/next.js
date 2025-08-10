---
title: Partial Prerendering
description: Learn how to use Partial Prerendering and combine the benefits of static and dynamic rendering.
version: experimental
related:
  title: Next Steps
  description: Learn more about the config option for Partial Prerendering.
  links:
    - app/api-reference/config/next-config-js/ppr
---

Partial Prerendering (PPR) is a rendering strategy that allows you to combine static and dynamic content in the same route. This improves the initial page performance while still supporting personalized, dynamic data.

<Image
  alt="Partially Prerendered Product Page showing static nav and product information, and dynamic cart and recommended products"
  srcLight="/learn/light/thinking-in-ppr.png"
  srcDark="/learn/dark/thinking-in-ppr.png"
  width="1600"
  height="632"
/>

When a user visits a route:

- The server sends a **shell** containing the static content, ensuring a fast initial load.
- The shell leaves **holes** for the dynamic content that will load in asynchronously.
- The dynamic holes are **streamed in parallel**, reducing the overall load time of the page.

> **🎥 Watch:** Why PPR and how it works → [YouTube (10 minutes)](https://www.youtube.com/watch?v=MTcPrTIBkpA).

## How does Partial Prerendering work?

To understand Partial Prerendering, it helps to be familiar with the rendering strategies available in Next.js.

### Static Rendering

With Static Rendering, HTML is generated ahead of time—either at build time or through [revalidation](/docs/app/guides/incremental-static-regeneration). The result is cached and shared across users and requests.

In Partial Prerendering, Next.js prerenders a **static shell** for a route. This can include the layout and any other components that don't depend on request-time data.

### Dynamic Rendering

With Dynamic Rendering, HTML is generated at **request time**. This allows you to serve personalized content based on request-time data.

A component becomes dynamic if it uses the following APIs:

- [`cookies`](/docs/app/api-reference/functions/cookies)
- [`headers`](/docs/app/api-reference/functions/headers)
- [`connection`](/docs/app/api-reference/functions/connection)
- [`draftMode`](/docs/app/api-reference/functions/draft-mode)
- [`searchParams` prop](/docs/app/api-reference/file-conventions/page#searchparams-optional)
- [`unstable_noStore`](/docs/app/api-reference/functions/unstable_noStore)
- [`fetch`](/docs/app/api-reference/functions/fetch) with `{ cache: 'no-store' }`

In Partial Prerendering, using these APIs throws a special React error that informs Next.js the component cannot be statically rendered, causing a build error. You can use a [Suspense](#suspense) boundary to wrap your component to defer rendering until runtime.

### Suspense

React [Suspense](https://react.dev/reference/react/Suspense) is used to defer rendering parts of your application until some condition is met.

In Partial Prerendering, Suspense is used to mark **dynamic boundaries** in your component tree.

At build time, Next.js prerenders the static content and the `fallback` UI. The dynamic content is **postponed** until the user requests the route.

Wrapping a component in Suspense doesn't make the component itself dynamic (your API usage does), but rather Suspense is used as a boundary that encapsulates dynamic content and enable [streaming](#streaming)

```jsx filename="app/page.js"
import { Suspense } from 'react'
import StaticComponent from './StaticComponent'
import DynamicComponent from './DynamicComponent'
import Fallback from './Fallback'

export const experimental_ppr = true

export default function Page() {
  return (
    <>
      <StaticComponent />
      <Suspense fallback={<Fallback />}>
        <DynamicComponent />
      </Suspense>
    </>
  )
}
```

### Streaming

Streaming splits the route into chunks and progressively streams them to the client as they become ready. This allows the user to see parts of the page immediately, before the entire content has finished rendering.

<Image
  alt="Diagram showing partially rendered page on the client, with loading UI for chunks that are being streamed."
  srcLight="/docs/light/server-rendering-with-streaming.png"
  srcDark="/docs/dark/server-rendering-with-streaming.png"
  width="1600"
  height="785"
/>

In Partial Prerendering, dynamic components wrapped in Suspense start streaming from the server in parallel.

<Image
  alt="Diagram showing parallelization of route segments during streaming, showing data fetching, rendering, and hydration of individual chunks."
  srcLight="/docs/light/sequential-parallel-data-fetching.png"
  srcDark="/docs/dark/sequential-parallel-data-fetching.png"
  width="1600"
  height="525"
/>

To reduce network overhead, the full response—including static HTML and streamed dynamic parts—is sent in a **single HTTP request**. This avoids extra roundtrips and improves both initial load and overall performance.

## Enabling Partial Prerendering

You can enable PPR by adding the [`ppr`](https://rc.nextjs.org/docs/app/api-reference/next-config-js/ppr) option to your `next.config.ts` file:

```ts filename="next.config.ts" highlight={5} switcher
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    ppr: 'incremental',
  },
}

export default nextConfig
```

```js filename="next.config.js" highlight={4} switcher
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    ppr: 'incremental',
  },
}
```

The `'incremental'` value allows you to adopt PPR for specific routes:

```tsx filename="/app/dashboard/layout.tsx" switcher
export const experimental_ppr = true

export default function Layout({ children }: { children: React.ReactNode }) {
  // ...
}
```

```jsx filename="/app/dashboard/layout.jsx" switcher
export const experimental_ppr = true

export default function Layout({ children }) {
  // ...
}
```

Routes that don't have `experimental_ppr` will default to `false` and will not be prerendered using PPR. You need to explicitly opt-in to PPR for each route.

> **Good to know**:
>
> - `experimental_ppr` will apply to all children of the route segment, including nested layouts and pages. You don't have to add it to every file, only the top segment of a route.
> - To disable PPR for children segments, you can set `experimental_ppr` to `false` in the child segment.

## Examples

### Dynamic APIs

When using Dynamic APIs that require looking at the incoming request, Next.js will opt into dynamic rendering for the route. To continue using PPR, wrap the component with Suspense. For example, the `<User />` component is dynamic because it uses the `cookies` API:

```jsx filename="app/user.js" switcher
import { cookies } from 'next/headers'

export async function User() {
  const session = (await cookies()).get('session')?.value
  return '...'
}
```

```tsx filename="app/user.tsx" switcher
import { cookies } from 'next/headers'

export async function User() {
  const session = (await cookies()).get('session')?.value
  return '...'
}
```

The `<User />` component will be streamed while any other content inside `<Page />` will be prerendered and become part of the static shell.

```tsx filename="app/page.tsx" switcher
import { Suspense } from 'react'
import { User, AvatarSkeleton } from './user'

export const experimental_ppr = true

export default function Page() {
  return (
    <section>
      <h1>This will be prerendered</h1>
      <Suspense fallback={<AvatarSkeleton />}>
        <User />
      </Suspense>
    </section>
  )
}
```

```jsx filename="app/page.js" switcher
import { Suspense } from 'react'
import { User, AvatarSkeleton } from './user'

export const experimental_ppr = true

export default function Page() {
  return (
    <section>
      <h1>This will be prerendered</h1>
      <Suspense fallback={<AvatarSkeleton />}>
        <User />
      </Suspense>
    </section>
  )
}
```

### Passing dynamic props

Components only opt into dynamic rendering when the value is accessed. For example, if you are reading `searchParams` from a `<Page />` component, you can forward this value to another component as a prop:

```tsx filename="app/page.tsx" switcher
import { Table, TableSkeleton } from './table'
import { Suspense } from 'react'

export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ sort: string }>
}) {
  return (
    <section>
      <h1>This will be prerendered</h1>
      <Suspense fallback={<TableSkeleton />}>
        <Table searchParams={searchParams} />
      </Suspense>
    </section>
  )
}
```

```jsx filename="app/page.js" switcher
import { Table, TableSkeleton } from './table'
import { Suspense } from 'react'

export default function Page({ searchParams }) {
  return (
    <section>
      <h1>This will be prerendered</h1>
      <Suspense fallback={<TableSkeleton />}>
        <Table searchParams={searchParams} />
      </Suspense>
    </section>
  )
}
```

Inside of the table component, accessing the value from `searchParams` will make the component dynamic while the rest of the page will be prerendered.

```tsx filename="app/table.tsx" switcher
export async function Table({
  searchParams,
}: {
  searchParams: Promise<{ sort: string }>
}) {
  const sort = (await searchParams).sort === 'true'
  return '...'
}
```

```jsx filename="app/table.js" switcher
export async function Table({ searchParams }) {
  const sort = (await searchParams).sort === 'true'
  return '...'
}
```
