---
title: use cache
description: Learn how to use the "use cache" directive to cache data in your Next.js application.
related:
  title: Related
  description: View related API references.
  links:
    - app/api-reference/directives/use-cache-private
    - app/api-reference/config/next-config-js/cacheComponents
    - app/api-reference/config/next-config-js/cacheLife
    - app/api-reference/config/next-config-js/cacheHandlers
    - app/api-reference/functions/cacheTag
    - app/api-reference/functions/cacheLife
    - app/api-reference/functions/revalidateTag
---

The `use cache` directive allows you to mark a route, React component, or a function as cacheable. It can be used at the top of a file to indicate that all exports in the file should be cached, or inline at the top of function or component to cache the return value.

> **Good to know:**
>
> - To use cookies or headers, read them outside cached scopes and pass values as arguments. This is the preferred pattern.
> - If the in-memory cache isn't sufficient for runtime data, [`'use cache: remote'`](/docs/app/api-reference/directives/use-cache-remote) allows platforms to provide a dedicated cache handler, though it requires a network roundtrip to check the cache and typically incurs platform fees.
> - For compliance requirements or when you can't refactor to pass runtime data as arguments to a `use cache` scope, see [`'use cache: private'`](/docs/app/api-reference/directives/use-cache-private).

## Usage

`use cache` is a Cache Components feature. To enable it, add the [`cacheComponents`](/docs/app/api-reference/config/next-config-js/cacheComponents) option to your `next.config.ts` file:

```ts filename="next.config.ts" switcher
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
}

export default nextConfig
```

```js filename="next.config.js" switcher
/** @type {import('next').NextConfig} */
const nextConfig = {
  cacheComponents: true,
}

module.exports = nextConfig
```

Then, add `use cache` at the file, component, or function level:

```tsx
// File level
'use cache'

export default async function Page() {
  // ...
}

// Component level
export async function MyComponent() {
  'use cache'
  return <></>
}

// Function level
export async function getData() {
  'use cache'
  const data = await fetch('/api/data')
  return data
}
```

> **Good to know**: When used at file level, all function exports must be async functions.

## How `use cache` works

### Cache keys

A cache entry's key is generated using a serialized version of its inputs, which includes:

1. **Build ID** - Unique per build, changing this invalidates all cache entries
2. **Function ID** - A secure hash of the function's location and signature in the codebase
3. **Serializable arguments** - Props (for components) or function arguments
4. **HMR refresh hash** (development only) - Invalidates cache on hot module replacement

When a cached function references variables from outer scopes, those variables are automatically captured and bound as arguments, making them part of the cache key.

```tsx filename="lib/data.ts"
async function Component({ userId }: { userId: string }) {
  const getData = async (filter: string) => {
    'use cache'
    // Cache key includes both userId (from closure) and filter (argument)
    return fetch(`/api/users/${userId}/data?filter=${filter}`)
  }

  return getData('active')
}
```

In the snippet above, `userId` is captured from the outer scope and `filter` is passed as an argument, so both become part of the `getData` function's cache key. This means different user and filter combinations will have separate cache entries.

## Serialization

Arguments to cached functions and their return values must be serializable.

For a complete reference, see:

- [Serializable arguments](https://react.dev/reference/rsc/use-server#serializable-parameters-and-return-values) - Uses **React Server Components** serialization
- [Serializable return types](https://react.dev/reference/rsc/use-client#serializable-types) - Uses **React Client Components** serialization

> **Good to know:** Arguments and return values use different serialization systems. Server Component serialization (for arguments) is more restrictive than Client Component serialization (for return values). This means you can return JSX elements but cannot accept them as arguments unless using pass-through patterns.

### Supported types

**Arguments:**

- Primitives: `string`, `number`, `boolean`, `null`, `undefined`
- Plain objects: `{ key: value }`
- Arrays: `[1, 2, 3]`
- Dates, Maps, Sets, TypedArrays, ArrayBuffers
- React elements (as pass-through only)

**Return values:**

- Same as arguments, plus JSX elements

### Unsupported types

- Class instances
- Functions (except as pass-through)
- Symbols, WeakMaps, WeakSets
- URL instances

```tsx filename="app/components/user-card.tsx"
// Valid - primitives and plain objects
async function UserCard({
  id,
  config,
}: {
  id: string
  config: { theme: string }
}) {
  'use cache'
  return <div>{id}</div>
}

// Invalid - class instance
async function UserProfile({ user }: { user: UserClass }) {
  'use cache'
  // Error: Cannot serialize class instance
  return <div>{user.name}</div>
}
```

### Pass-through (non-serializable arguments)

You can accept non-serializable values **as long as you don't introspect them**. This enables composition patterns with `children` and Server Actions:

```tsx filename="app/components/cached-wrapper.tsx"
async function CachedWrapper({ children }: { children: ReactNode }) {
  'use cache'
  // Don't read or modify children - just pass it through
  return (
    <div className="wrapper">
      <header>Cached Header</header>
      {children}
    </div>
  )
}

// Usage: children can be dynamic
export default function Page() {
  return (
    <CachedWrapper>
      <DynamicComponent /> {/* Not cached, passed through */}
    </CachedWrapper>
  )
}
```

You can also pass Server Actions through cached components:

```tsx filename="app/components/cached-form.tsx"
async function CachedForm({ action }: { action: () => Promise<void> }) {
  'use cache'
  // Don't call action here - just pass it through
  return <form action={action}>{/* ... */}</form>
}
```

## Constraints

Cached functions and components **cannot** directly access runtime APIs like `cookies()`, `headers()`, or `searchParams`. Instead, read these values outside the cached scope and pass them as arguments.

### Runtime caching considerations

While `use cache` is designed primarily to include dynamic data in the static shell, it can also cache data at runtime using in-memory LRU (Least Recently Used) storage.

Runtime cache behavior depends on your hosting environment:

| Environment     | Runtime Caching Behavior                                                                                                                                          |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Serverless**  | Cache entries typically don't persist across requests (each request can be a different instance). Build-time caching works normally.                              |
| **Self-hosted** | Cache entries persist across requests. Control cache size with [`cacheMaxMemorySize`](/docs/app/api-reference/config/next-config-js/incrementalCacheHandlerPath). |

If the default in-memory cache isn't enough, consider **[`use cache: remote`](/docs/app/api-reference/directives/use-cache-remote)** which allows platforms to provide a dedicated cache handler (like Redis or KV database). This helps reduce hits against data sources not scaled to your total traffic, though it comes with costs (storage, network latency, platform fees).

Very rarely, for compliance requirements or when you can't refactor your code to pass runtime data as arguments to a `use cache` scope, you might need [`use cache: private`](/docs/app/api-reference/directives/use-cache-private).

## `use cache` at runtime

On the **server**, cache entries are stored in-memory and respect the `revalidate` and `expire` times from your `cacheLife` configuration. You can customize the cache storage by configuring [`cacheHandlers`](/docs/app/api-reference/config/next-config-js/cacheHandlers) in your `next.config.js` file.

On the **client**, content from the server cache is stored in the browser's memory for the duration defined by the `stale` time. The client router enforces a **minimum 30-second stale time**, regardless of configuration.

The `x-nextjs-stale-time` response header communicates cache lifetime from server to client, ensuring coordinated behavior.

## Revalidation

By default, `use cache` uses the `default` profile with these settings:

- **stale**: 5 minutes (client-side)
- **revalidate**: 15 minutes (server-side)
- **expire**: Never expires by time

```tsx filename="lib/data.ts"
async function getData() {
  'use cache'
  // Implicitly uses default profile
  return fetch('/api/data')
}
```

### Customizing cache lifetime

Use the [`cacheLife`](/docs/app/api-reference/functions/cacheLife) function to customize cache duration:

```tsx filename="lib/data.ts"
import { cacheLife } from 'next/cache'

async function getData() {
  'use cache'
  cacheLife('hours') // Use built-in 'hours' profile
  return fetch('/api/data')
}
```

### On-demand revalidation

Use [`cacheTag`](/docs/app/api-reference/functions/cacheTag), [`updateTag`](/docs/app/api-reference/functions/updateTag), or [`revalidateTag`](/docs/app/api-reference/functions/revalidateTag) for on-demand cache invalidation:

```tsx filename="lib/data.ts"
import { cacheTag } from 'next/cache'

async function getProducts() {
  'use cache'
  cacheTag('products')
  return fetch('/api/products')
}
```

```tsx filename="app/actions.ts"
'use server'

import { updateTag } from 'next/cache'

export async function updateProduct() {
  await db.products.update(...)
  updateTag('products') // Invalidates all 'products' caches
}
```

Both `cacheLife` and `cacheTag` integrate across client and server caching layers, meaning you configure your caching semantics in one place and they apply everywhere.

## Examples

### Caching an entire route with `use cache`

To pre-render an entire route, add `use cache` to the top of **both** the `layout` and `page` files. Each of these segments are treated as separate entry points in your application, and will be cached independently.

```tsx filename="app/layout.tsx" switcher
'use cache'

export default async function Layout({ children }: { children: ReactNode }) {
  return <div>{children}</div>
}
```

```jsx filename="app/layout.js" switcher
'use cache'

export default async function Layout({ children }) {
  return <div>{children}</div>
}
```

Any components imported and nested in `page` file are part of the cache output associated with the `page`.

```tsx filename="app/page.tsx" switcher
'use cache'

async function Users() {
  const users = await fetch('/api/users')
  // loop through users
}

export default async function Page() {
  return (
    <main>
      <Users />
    </main>
  )
}
```

```jsx filename="app/page.js" switcher
'use cache'

async function Users() {
  const users = await fetch('/api/users')
  // loop through users
}

export default async function Page() {
  return (
    <main>
      <Users />
    </main>
  )
}
```

> **Good to know**:
>
> - If `use cache` is added only to the `layout` or the `page`, only that route segment and any components imported into it will be cached.

### Caching a component's output with `use cache`

You can use `use cache` at the component level to cache any fetches or computations performed within that component. The cache entry will be reused as long as the serialized props produce the same value in each instance.

```tsx filename="app/components/bookings.tsx" highlight={2} switcher
export async function Bookings({ type = 'haircut' }: BookingsProps) {
  'use cache'
  async function getBookingsData() {
    const data = await fetch(`/api/bookings?type=${encodeURIComponent(type)}`)
    return data
  }
  return //...
}

interface BookingsProps {
  type: string
}
```

```jsx filename="app/components/bookings.js" highlight={2} switcher
export async function Bookings({ type = 'haircut' }) {
  'use cache'
  async function getBookingsData() {
    const data = await fetch(`/api/bookings?type=${encodeURIComponent(type)}`)
    return data
  }
  return //...
}
```

### Caching function output with `use cache`

Since you can add `use cache` to any asynchronous function, you aren't limited to caching components or routes only. You might want to cache a network request, a database query, or a slow computation.

```tsx filename="app/actions.ts" highlight={2} switcher
export async function getData() {
  'use cache'

  const data = await fetch('/api/data')
  return data
}
```

```jsx filename="app/actions.js" highlight={2} switcher
export async function getData() {
  'use cache'

  const data = await fetch('/api/data')
  return data
}
```

### Interleaving

In React, composition with `children` or slots is a well-known pattern for building flexible components. When using `use cache`, you can continue to compose your UI in this way. Anything included as `children`, or other compositional slots, in the returned JSX will be passed through the cached component without affecting its cache entry.

As long as you don't directly reference any of the JSX slots inside the body of the cacheable function itself, their presence in the returned output won't affect the cache entry.

```tsx filename="app/page.tsx" switcher
export default async function Page() {
  const uncachedData = await getData()
  return (
    // Pass compositional slots as props, e.g. header and children
    <CacheComponent header={<h1>Home</h1>}>
      {/* DynamicComponent is provided as the children slot */}
      <DynamicComponent data={uncachedData} />
    </CacheComponent>
  )
}

async function CacheComponent({
  header, // header: a compositional slot, injected as a prop
  children, // children: another slot for nested composition
}: {
  header: ReactNode
  children: ReactNode
}) {
  'use cache'
  const cachedData = await fetch('/api/cached-data')
  return (
    <div>
      {header}
      <PrerenderedComponent data={cachedData} />
      {children}
    </div>
  )
}
```

```jsx filename="app/page.js" switcher
export default async function Page() {
  const uncachedData = await getData()
  return (
    // Pass compositional slots as props, e.g. header and children
    <CacheComponent header={<h1>Home</h1>}>
      {/* DynamicComponent is provided as the children slot */}
      <DynamicComponent data={uncachedData} />
    </CacheComponent>
  )
}

async function CacheComponent({
  header, // header: a compositional slot, injected as a prop
  children, // children: another slot for nested composition
}) {
  'use cache'
  const cachedData = await fetch('/api/cached-data')
  return (
    <div>
      {header}
      <PrerenderedComponent data={cachedData} />
      {children}
    </div>
  )
}
```

You can also pass Server Actions through cached components to Client Components without invoking them inside the cacheable function.

```tsx filename="app/page.tsx" switcher
import ClientComponent from './ClientComponent'

export default async function Page() {
  const performUpdate = async () => {
    'use server'
    // Perform some server-side update
    await db.update(...)
  }

  return <CachedComponent performUpdate={performUpdate} />
}

async function CachedComponent({
  performUpdate,
}: {
  performUpdate: () => Promise<void>
}) {
  'use cache'
  // Do not call performUpdate here
  return <ClientComponent action={performUpdate} />
}
```

```jsx filename="app/page.js" switcher
import ClientComponent from './ClientComponent'

export default async function Page() {
  const performUpdate = async () => {
    'use server'
    // Perform some server-side update
    await db.update(...)
  }

  return <CachedComponent performUpdate={performUpdate} />
}

async function CachedComponent({ performUpdate }) {
  'use cache'
  // Do not call performUpdate here
  return <ClientComponent action={performUpdate} />
}
```

```tsx filename="app/ClientComponent.tsx" switcher
'use client'

export default function ClientComponent({
  action,
}: {
  action: () => Promise<void>
}) {
  return <button onClick={action}>Update</button>
}
```

```jsx filename="app/ClientComponent.js" switcher
'use client'

export default function ClientComponent({ action }) {
  return <button onClick={action}>Update</button>
}
```

## Troubleshooting

### Debugging cache behavior

#### Verbose logging

Set `NEXT_PRIVATE_DEBUG_CACHE=1` for verbose cache logging:

```bash
NEXT_PRIVATE_DEBUG_CACHE=1 npm run dev
# or for production
NEXT_PRIVATE_DEBUG_CACHE=1 npm run start
```

> **Good to know:** This environment variable also logs ISR and other caching mechanisms. See [Verifying correct production behavior](/docs/app/guides/incremental-static-regeneration#verifying-correct-production-behavior) for more details.

#### Console log replays

In development, console logs from cached functions appear with a `Cache` prefix.

### Build Hangs (Cache Timeout)

If your build hangs, you're accessing Promises that resolve to dynamic or runtime data, created outside a `use cache` boundary. The cached function waits for data that can't resolve during the build, causing a timeout after 50 seconds.

When the build timeouts you'll see this error message:

> Error: Filling a cache during prerender timed out, likely because request-specific arguments such as params, searchParams, cookies() or dynamic data were used inside "use cache".

Common ways this happens: passing such Promises as props, accessing them via closure, or retrieving them from shared storage (Maps).

> **Good to know:** Directly calling `cookies()` or `headers()` inside `use cache` fails immediately with a [different error](/docs/messages/next-request-in-use-cache), not a timeout.

**Passing runtime data Promises as props:**

```tsx filename="app/page.tsx"
import { cookies } from 'next/headers'
import { Suspense } from 'react'

export default function Page() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <Dynamic />
    </Suspense>
  )
}

async function Dynamic() {
  const cookieStore = cookies()
  return <Cached promise={cookieStore} /> // Build hangs
}

async function Cached({ promise }: { promise: Promise<unknown> }) {
  'use cache'
  const data = await promise // Waits for runtime data during build
  return <p>..</p>
}
```

Await the `cookies` store in the `Dynamic` component, and pass a cookie value to the `Cached` component.

**Shared deduplication storage:**

```tsx filename="app/page.tsx"
// Problem: Map stores dynamic Promises, accessed by cached code
import { Suspense } from 'react'

const cache = new Map<string, Promise<string>>()

export default function Page() {
  return (
    <>
      <Suspense fallback={<div>Loading...</div>}>
        <Dynamic id="data" />
      </Suspense>
      <Cached id="data" />
    </>
  )
}

async function Dynamic({ id }: { id: string }) {
  // Stores dynamic Promise in shared Map
  cache.set(
    id,
    fetch(`https://api.example.com/${id}`).then((r) => r.text())
  )
  return <p>Dynamic</p>
}

async function Cached({ id }: { id: string }) {
  'use cache'
  return <p>{await cache.get(id)}</p> // Build hangs - retrieves dynamic Promise
}
```

Use Next.js's built-in `fetch()` deduplication or use separate Maps for cached and uncached contexts.

## Platform Support

| Deployment Option                                                   | Supported         |
| ------------------------------------------------------------------- | ----------------- |
| [Node.js server](/docs/app/getting-started/deploying#nodejs-server) | Yes               |
| [Docker container](/docs/app/getting-started/deploying#docker)      | Yes               |
| [Static export](/docs/app/getting-started/deploying#static-export)  | No                |
| [Adapters](/docs/app/getting-started/deploying#adapters)            | Platform-specific |

Learn how to [configure caching](/docs/app/guides/self-hosting#caching-and-isr) when self-hosting Next.js.

## Version History

| Version   | Changes                                                     |
| --------- | ----------------------------------------------------------- |
| `v16.0.0` | `"use cache"` is enabled with the Cache Components feature. |
| `v15.0.0` | `"use cache"` is introduced as an experimental feature.     |
