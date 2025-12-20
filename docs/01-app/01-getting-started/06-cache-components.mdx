---
title: Cache Components
description: Learn how to use Cache Components and combine the benefits of static and dynamic rendering.
related:
  title: Next Steps
  description: Learn more about the config option for Cache Components.
  links:
    - app/api-reference/config/next-config-js/cacheComponents
    - app/api-reference/directives/use-cache
    - app/api-reference/functions/cacheLife
    - app/api-reference/functions/cacheTag
    - app/api-reference/functions/revalidateTag
    - app/api-reference/functions/updateTag
---

> **Good to know:** Cache Components is an opt-in feature. Enable it by setting the `cacheComponents` flag to `true` in your Next config file. See [Enabling Cache Components](#enabling-cache-components) for more details.

Cache Components lets you mix static, cached, and dynamic content in a single route, giving you the speed of static sites with the flexibility of dynamic rendering.

Server-rendered applications typically force a choice between static pages (fast but stale) and dynamic pages (fresh but slow). Moving this work to the client trades server load for larger bundles and slower initial rendering.

Cache Components eliminates these tradeoffs by prerendering routes into a **static HTML shell** that's immediately sent to the browser, with dynamic content updating the UI as it becomes ready.

<Image
  alt="Partially re-rendered Product Page showing static nav and product information, and dynamic cart and recommended products"
  srcLight="/learn/light/thinking-in-ppr.png"
  srcDark="/learn/dark/thinking-in-ppr.png"
  width="1600"
  height="632"
/>

## How rendering works with Cache Components

At build time, Next.js renders your route's component tree. As long as components don't access network resources, certain system APIs, or require an incoming request to render, their output is **automatically added to the static shell**. Otherwise, you must choose how to handle them:

- Defer rendering to request time by wrapping components in React's [`<Suspense>`](https://react.dev/reference/react/Suspense), [showing fallback UI](#defer-rendering-to-request-time) until the content is ready, or
- Cache the result using the [`use cache`](/docs/app/api-reference/directives/use-cache) directive to [include it in the static shell](#using-use-cache) (if no request data is needed)

Because this happens ahead of time, before a request arrives, we refer to it as prerendering. This generates a static shell consisting of HTML for initial page loads and a serialized [RSC Payload](/docs/app/getting-started/server-and-client-components#on-the-server) for client-side navigation, ensuring the browser receives fully rendered content instantly whether users navigate directly to the URL or transition from another page.

Next.js requires you to explicitly handle components that can't complete during prerendering. If they aren't wrapped in `<Suspense>` or marked with `use cache`, you'll see an [`Uncached data was accessed outside of <Suspense>`](https://nextjs.org/docs/messages/blocking-route) error during development and build time.

> **Good to know**: Caching can be applied at the component or function level, while fallback UI can be defined around any subtree, which means you can compose static, cached, and dynamic content within a single route.

<Image
  alt="Diagram showing partially rendered page on the client, with loading UI for chunks that are being streamed."
  srcLight="/docs/light/server-rendering-with-streaming.png"
  srcDark="/docs/dark/server-rendering-with-streaming.png"
  width="1600"
  height="785"
/>

This rendering approach is called **Partial Prerendering**, and it's the default behavior with Cache Components. For the rest of this document, we simply refer to it as "prerendering" which can produce a partial or complete output.

> **🎥 Watch:** Why Partial Prerendering and how it works → [YouTube (10 minutes)](https://www.youtube.com/watch?v=MTcPrTIBkpA).

## Automatically prerendered content

Operations like synchronous I/O, module imports, and pure computations can complete during prerendering. Components using only these operations have their rendered output included in the static HTML shell.

Because all operations in the `Page` component below complete during rendering, its rendered output is automatically included in the static shell. When both the layout and page prerender successfully, the entire route is the static shell.

```tsx filename="page.tsx"
import fs from 'node:fs'

export default async function Page() {
  // Synchronous file system read
  const content = fs.readFileSync('./config.json', 'utf-8')

  // Module imports
  const constants = await import('./constants.json')

  // Pure computations
  const processed = JSON.parse(content).items.map((item) => item.value * 2)

  return (
    <div>
      <h1>{constants.appName}</h1>
      <ul>
        {processed.map((value, i) => (
          <li key={i}>{value}</li>
        ))}
      </ul>
    </div>
  )
}
```

> **Good to know**: You can verify that a route was fully prerendered by checking the build output summary. Alternatively, see what content was added to the static shell of any page by viewing the page source in your browser.

## Defer rendering to request time

During prerendering, when Next.js encounters work it can't complete (like network requests, accessing request data, or async operations), it requires you to explicitly handle it. To defer rendering to request time, a parent component must provide fallback UI using a Suspense boundary. The fallback becomes part of the static shell while the actual content resolves at request time.

Place Suspense boundaries as close as possible to the components that need them. This maximizes the amount of content in the static shell, since everything outside the boundary can still prerender normally.

> **Good to know**: With Suspense boundaries, multiple dynamic sections can render in parallel rather than blocking each other, reducing total load time.

### Dynamic content

External systems provide content asynchronously, which often takes an unpredictable time to resolve and may even fail. This is why prerendering doesn't execute them automatically.

In general, when you need the latest data from the source on each request (like real-time feeds or personalized content), defer rendering by providing fallback UI with a Suspense boundary.

For example, the `DynamicContent` component below uses multiple operations that are not automatically prerendered.

```tsx filename="page.tsx"
import { Suspense } from 'react'
import fs from 'node:fs/promises'

async function DynamicContent() {
  // Network request
  const data = await fetch('https://api.example.com/data')

  // Database query
  const users = await db.query('SELECT * FROM users')

  // Async file system operation
  const file = await fs.readFile('..', 'utf-8')

  // Simulating external system delay
  await new Promise((resolve) => setTimeout(resolve, 100))

  return <div>Not in the static shell</div>
}
```

To use `DynamicContent` within a page, wrap it in `<Suspense>` to define fallback UI:

```tsx filename="page.tsx"
export default async function Page(props) {
  return (
    <>
      <h1>Part of the static shell</h1>
      {/* <p>Loading..</p> is part of the static shell */}
      <Suspense fallback={<p>Loading..</p>}>
        <DynamicContent />
        <div>Sibling excluded from static shell</div>
      </Suspense>
    </>
  )
}
```

Prerendering stops at the `fetch` request. The request itself is not started, and any code after it is not executed.

The fallback (`<p>Loading...</p>`) is included in the static shell, while the component's content streams at request time.

In this example, since all operations (network request, database query, file read, and timeout) run sequentially within the same component, the content won't appear until they all complete.

> **Good to know**: For dynamic content that doesn't change frequently, you can use `use cache` to include the dynamic data in the static shell instead of streaming it. See the [during prerendering](#during-prerendering) section for an example.

### Runtime data

A specific type of dynamic data that requires request context, only available when a user makes a request.

- [`cookies()`](/docs/app/api-reference/functions/cookies) - User's cookie data
- [`headers()`](/docs/app/api-reference/functions/headers) - Request headers
- [`searchParams`](/docs/app/api-reference/file-conventions/page#searchparams-optional) - URL query parameters
- [`params`](/docs/app/api-reference/file-conventions/page#params-optional) - Dynamic route parameters (unless at least one sample is provided via [`generateStaticParams`](/docs/app/api-reference/functions/generate-static-params)). See [Dynamic Routes with Cache Components](/docs/app/api-reference/file-conventions/dynamic-routes#with-cache-components) for detailed patterns.

```tsx filename="page.tsx"
import { cookies, headers } from 'next/headers'
import { Suspense } from 'react'

async function RuntimeData({ searchParams }) {
  // Accessing request data
  const cookieStore = await cookies()
  const headerStore = await headers()
  const search = await searchParams

  return <div>Not in the static shell</div>
}
```

To use the `RuntimeData` component, wrap it in a `<Suspense>` boundary:

```tsx filename="page.tsx"
export default async function Page(props) {
  return (
    <>
      <h1>Part of the static shell</h1>
      {/* <p>Loading..</p> is part of the static shell */}
      <Suspense fallback={<p>Loading..</p>}>
        <RuntimeData searchParams={props.searchParams} />
        <div>Sibling excluded from static shell</div>
      </Suspense>
    </>
  )
}
```

Use [`connection()`](/docs/app/api-reference/functions/connection) if you need to defer to request time without accessing any of the runtime APIs above.

> **Good to know**: Runtime data cannot be cached with `use cache` because it requires request context. Components that access runtime APIs must always be wrapped in `<Suspense>`. However, you can extract values from runtime data and pass them as arguments to cached functions. See the [with runtime data](#with-runtime-data) section for an example.

### Non-deterministic operations

Operations like `Math.random()`, `Date.now()`, or `crypto.randomUUID()` produce different values each time they execute. To ensure these run at request time (generating unique values per request), Cache Components requires you to explicitly signal this intent by calling these operations after dynamic or runtime data access.

```tsx
import { connection } from 'next/server'
import { Suspense } from 'react'

async function UniqueContent() {
  // Explicitly defer to request time
  await connection()

  // Non-deterministic operations
  const random = Math.random()
  const now = Date.now()
  const date = new Date()
  const uuid = crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))

  return (
    <div>
      <p>{random}</p>
      <p>{now}</p>
      <p>{date.getTime()}</p>
      <p>{uuid}</p>
      <p>{bytes}</p>
    </div>
  )
}
```

Because the `UniqueContent` component defers to request time, to use it within a route, it must be wrapped in `<Suspense>`:

```tsx filename="page.tsx"
export default async function Page() {
  return (
    // <p>Loading..</p> is part of the static shell
    <Suspense fallback={<p>Loading..</p>}>
      <UniqueContent />
    </Suspense>
  )
}
```

Every incoming request would see different random numbers, date, etc.

> **Good to know**: You can cache non-deterministic operations with `use cache`. See the [with non-deterministic operations](#with-non-deterministic-operations) section for examples.

## Using `use cache`

The [`use cache`](/docs/app/api-reference/directives/use-cache) directive caches the return value of async functions and components. You can apply it at the function, component, or file level.

Arguments and any closed-over values from parent scopes automatically become part of the [cache key](/docs/app/api-reference/directives/use-cache#cache-keys), which means different inputs produce separate cache entries. This enables personalized or parameterized cached content.

When [dynamic content](#dynamic-content) doesn't need to be fetched fresh from the source on every request, caching it lets you include the content in the static shell during prerendering, or reuse the result at runtime across multiple requests.

Cached content can be revalidated in two ways: automatically based on the cache lifetime, or on-demand using tags with [`revalidateTag`](/docs/app/api-reference/functions/revalidateTag) or [`updateTag`](/docs/app/api-reference/functions/updateTag).

> **Good to know**: See [serialization requirements and constraints](/docs/app/api-reference/directives/use-cache#constraints) for details on what can be cached and how arguments work.

### During prerendering

While [dynamic content](#dynamic-content) is fetched from external sources, it's often unlikely to change between accesses. Product catalog data updates with inventory changes, blog post content rarely changes after publishing, and analytics reports for past dates remain static.

If this data doesn't depend on [runtime data](#runtime-data), you can use the `use cache` directive to include it in the static HTML shell. Use [`cacheLife`](/docs/app/api-reference/functions/cacheLife) to define how long to use the cached data.

When revalidation occurs, the static shell is updated with fresh content. See [Tagging and revalidating](#tagging-and-revalidating) for details on on-demand revalidation.

```tsx filename="app/page.tsx" highlight={1,4,5}
import { cacheLife } from 'next/cache'

export default async function Page() {
  'use cache'
  cacheLife('hours')

  const users = await db.query('SELECT * FROM users')

  return (
    <ul>
      {users.map((user) => (
        <li key={user.id}>{user.name}</li>
      ))}
    </ul>
  )
}
```

The `cacheLife` function accepts a cache profile name (like `'hours'`, `'days'`, or `'weeks'`) or a custom configuration object to control cache behavior:

```tsx filename="app/page.tsx" highlight={1,4-8}
import { cacheLife } from 'next/cache'

export default async function Page() {
  'use cache'
  cacheLife({
    stale: 3600, // 1 hour until considered stale
    revalidate: 7200, // 2 hours until revalidated
    expire: 86400, // 1 day until expired
  })

  const users = await db.query('SELECT * FROM users')

  return (
    <ul>
      {users.map((user) => (
        <li key={user.id}>{user.name}</li>
      ))}
    </ul>
  )
}
```

See the [`cacheLife` API reference](/docs/app/api-reference/functions/cacheLife) for available profiles and custom configuration options.

### With runtime data

Runtime data and [`use cache`](/docs/app/api-reference/directives/use-cache) cannot be used in the same scope. However, you can extract values from runtime APIs and pass them as arguments to cached functions.

```tsx filename="app/profile/page.tsx"
import { cookies } from 'next/headers'
import { Suspense } from 'react'

export default function Page() {
  // Page itself creates the dynamic boundary
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ProfileContent />
    </Suspense>
  )
}

// Component (not cached) reads runtime data
async function ProfileContent() {
  const session = (await cookies()).get('session')?.value

  return <CachedContent sessionId={session} />
}

// Cached component/function receives data as props
async function CachedContent({ sessionId }: { sessionId: string }) {
  'use cache'
  // sessionId becomes part of cache key
  const data = await fetchUserData(sessionId)
  return <div>{data}</div>
}
```

At request time, `CachedContent` executes if no matching cache entry is found, and stores the result for future requests.

### With non-deterministic operations

Within a `use cache` scope, non-deterministic operations execute during prerendering. This is useful when you want the same rendered output served to all users:

```tsx
export default async function Page() {
  'use cache'

  // Execute once, then cached for all requests
  const random = Math.random()
  const random2 = Math.random()
  const now = Date.now()
  const date = new Date()
  const uuid = crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))

  return (
    <div>
      <p>
        {random} and {random2}
      </p>
      <p>{now}</p>
      <p>{date.getTime()}</p>
      <p>{uuid}</p>
      <p>{bytes}</p>
    </div>
  )
}
```

All requests will be served a route containing the same random numbers, timestamp, and UUID until the cache is revalidated.

### Tagging and revalidating

Tag cached data with [`cacheTag`](/docs/app/api-reference/functions/cacheTag) and revalidate it after mutations using [`updateTag`](/docs/app/api-reference/functions/updateTag) in Server Actions for immediate updates, or [`revalidateTag`](/docs/app/api-reference/functions/revalidateTag) when delays in updates are acceptable.

#### With `updateTag`

Use `updateTag` when you need to expire and immediately refresh cached data within the same request:

```tsx filename="app/actions.ts" highlight={1,4,5,13}
import { cacheTag, updateTag } from 'next/cache'

export async function getCart() {
  'use cache'
  cacheTag('cart')
  // fetch data
}

export async function updateCart(itemId: string) {
  'use server'
  // write data using the itemId
  // update the user cart
  updateTag('cart')
}
```

#### With `revalidateTag`

Use `revalidateTag` when you want to invalidate only properly tagged cached entries with stale-while-revalidate behavior. This is ideal for static content that can tolerate eventual consistency.

```tsx filename="app/actions.ts" highlight={1,4,5,12}
import { cacheTag, revalidateTag } from 'next/cache'

export async function getPosts() {
  'use cache'
  cacheTag('posts')
  // fetch data
}

export async function createPost(post: FormData) {
  'use server'
  // write data using the FormData
  revalidateTag('posts', 'max')
}
```

For more detailed explanation and usage examples, see the [`use cache` API reference](/docs/app/api-reference/directives/use-cache).

### What should I cache?

What you cache should be a function of what you want your UI loading states to be. If data doesn't depend on runtime data and you're okay with a cached value being served for multiple requests over a period of time, use `use cache` with `cacheLife` to describe that behavior.

For content management systems with update mechanisms, consider using tags with longer cache durations and rely on `revalidateTag` to mark static initial UI as ready for revalidation. This pattern allows you to serve fast, cached responses while still updating content when it actually changes, rather than expiring the cache preemptively.

## Putting it all together

Here's a complete example showing static content, cached dynamic content, and streaming dynamic content working together on a single page:

```tsx filename="app/blog/page.tsx"
import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { cacheLife } from 'next/cache'
import Link from 'next/link'

export default function BlogPage() {
  return (
    <>
      {/* Static content - prerendered automatically */}
      <header>
        <h1>Our Blog</h1>
        <nav>
          <Link href="/">Home</Link> | <Link href="/about">About</Link>
        </nav>
      </header>

      {/* Cached dynamic content - included in the static shell */}
      <BlogPosts />

      {/* Runtime dynamic content - streams at request time */}
      <Suspense fallback={<p>Loading your preferences...</p>}>
        <UserPreferences />
      </Suspense>
    </>
  )
}

// Everyone sees the same blog posts (revalidated every hour)
async function BlogPosts() {
  'use cache'
  cacheLife('hours')

  const res = await fetch('https://api.vercel.app/blog')
  const posts = await res.json()

  return (
    <section>
      <h2>Latest Posts</h2>
      <ul>
        {posts.slice(0, 5).map((post: any) => (
          <li key={post.id}>
            <h3>{post.title}</h3>
            <p>
              By {post.author} on {post.date}
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}

// Personalized per user based on their cookie
async function UserPreferences() {
  const theme = (await cookies()).get('theme')?.value || 'light'
  const favoriteCategory = (await cookies()).get('category')?.value

  return (
    <aside>
      <p>Your theme: {theme}</p>
      {favoriteCategory && <p>Favorite category: {favoriteCategory}</p>}
    </aside>
  )
}
```

During prerendering the header (static) and the blog posts fetched from the API (cached with `use cache`), both become part of the static shell along with the fallback UI for user preferences.

When a user visits the page, they instantly see this prerendered shell with the header and blog posts. Only the personalized preferences need to stream in at request time since they depend on the user's cookies. This ensures fast initial page loads while still providing personalized content.

## Metadata and Viewport

`generateMetadata` and `generateViewport` are part of rendering your page or layout. During prerendering, their access to runtime data or uncached dynamic data is tracked separately from the rest of the page.

If a page or layout is prerenderable but only metadata or viewport accesses uncached dynamic data or runtime data, Next.js requires an explicit choice: cache the data if possible, or signal that deferred rendering is intentional. See [Metadata with Cache Components](/docs/app/api-reference/functions/generate-metadata#with-cache-components) and [Viewport with Cache Components](/docs/app/api-reference/functions/generate-viewport#with-cache-components) for how to handle this.

## Enabling Cache Components

You can enable Cache Components (which includes PPR) by adding the [`cacheComponents`](/docs/app/api-reference/config/next-config-js/cacheComponents) option to your Next config file:

```ts filename="next.config.ts" highlight={4} switcher
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
}

export default nextConfig
```

```js filename="next.config.js" highlight={3} switcher
/** @type {import('next').NextConfig} */
const nextConfig = {
  cacheComponents: true,
}

module.exports = nextConfig
```

> **Good to know:** When Cache Components is enabled, `GET` Route Handlers follow the same prerendering model as pages. See [Route Handlers with Cache Components](/docs/app/getting-started/route-handlers#with-cache-components) for details.

## Navigation uses Activity

When the [`cacheComponents`](/docs/app/api-reference/config/next-config-js/cacheComponents) flag is enabled, Next.js uses React's [`<Activity>`](https://react.dev/reference/react/Activity) component to preserve component state during client-side navigation.

Rather than unmounting the previous route when you navigate away, Next.js sets the Activity mode to [`"hidden"`](https://react.dev/reference/react/Activity#activity). This means:

- Component state is preserved when navigating between routes
- When you navigate back, the previous route reappears with its state intact
- Effects are cleaned up when a route is hidden, and recreated when it becomes visible again

This behavior improves the navigation experience by maintaining UI state (form inputs, or expanded sections) when users navigate back and forth between routes.

> **Good to know**: Next.js uses heuristics to keep a few recently visited routes `"hidden"`, while older routes are removed from the DOM to prevent excessive growth.

## Migrating route segment configs

When Cache Components is enabled, several route segment config options are no longer needed or supported:

### `dynamic = "force-dynamic"`

**Not needed.** All pages are dynamic by default.

```tsx filename="app/page.tsx"
// Before - No longer needed
export const dynamic = 'force-dynamic'

export default function Page() {
  return <div>...</div>
}
```

```tsx filename="app/page.tsx"
// After - Just remove it
export default function Page() {
  return <div>...</div>
}
```

### `dynamic = "force-static"`

Start by removing it. When unhandled dynamic or runtime data access is detected during development and build time, Next.js raises an error. Otherwise, the [prerendering](#automatically-prerendered-content) step automatically extracts the static HTML shell.

For dynamic data access, add [`use cache`](#using-use-cache) as close to the data access as possible with a long [`cacheLife`](/docs/app/api-reference/functions/cacheLife) like `'max'` to maintain cached behavior. If needed, add it at the top of the page or layout.

For runtime data access (`cookies()`, `headers()`, etc.), errors will direct you to [wrap it with `Suspense`](#runtime-data). Since you started by using `force-static`, you must remove the runtime data access to prevent any request time work.

```tsx filename="app/page.tsx"
// Before
export const dynamic = 'force-static'

export default async function Page() {
  const data = await fetch('https://api.example.com/data')
  return <div>...</div>
}
```

```tsx filename="app/page.tsx"
import { cacheLife } from 'next/cache'

// After - Use 'use cache' instead
export default async function Page() {
  'use cache'
  cacheLife('max')
  const data = await fetch('https://api.example.com/data')
  return <div>...</div>
}
```

### `revalidate`

**Replace with `cacheLife`.** Use the `cacheLife` function to define cache duration instead of the route segment config.

```tsx
// Before
export const revalidate = 3600 // 1 hour

export default async function Page() {
  return <div>...</div>
}
```

```tsx filename="app/page.tsx"
// After - Use cacheLife
import { cacheLife } from 'next/cache'

export default async function Page() {
  'use cache'
  cacheLife('hours')
  return <div>...</div>
}
```

### `fetchCache`

**Not needed.** With `use cache`, all data fetching within a cached scope is automatically cached, making `fetchCache` unnecessary.

```tsx filename="app/page.tsx"
// Before
export const fetchCache = 'force-cache'
```

```tsx filename="app/page.tsx"
// After - Use 'use cache' to control caching behavior
export default async function Page() {
  'use cache'
  // All fetches here are cached
  return <div>...</div>
}
```

### `runtime = 'edge'`

**Not supported.** Cache Components requires Node.js runtime and will throw errors with [Edge Runtime](/docs/app/api-reference/edge).
