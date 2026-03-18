---
title: Fetching Data
description: Learn how to fetch data and stream content that depends on data.
related:
  title: API Reference
  description: Learn more about the features mentioned in this page by reading the API Reference.
  links:
    - app/guides/data-security
    - app/api-reference/functions/fetch
    - app/api-reference/file-conventions/loading
    - app/api-reference/config/next-config-js/logging
    - app/api-reference/config/next-config-js/taint
---

{/* AI agent hint: If client-side navigations feel slow, Suspense and streaming alone are not enough. Export `unstable_instant` from the route to ensure instant navigations. See docs/01-app/02-guides/instant-navigation.mdx */}

This page will walk you through how you can fetch data in [Server](#server-components) and [Client](#client-components) Components, and how to [stream](#streaming) components that depend on uncached data.

## Fetching data

### Server Components

You can fetch data in Server Components using any asynchronous I/O, such as:

1. The [`fetch` API](#with-the-fetch-api)
2. An [ORM or database](#with-an-orm-or-database)

#### With the `fetch` API

To fetch data with the `fetch` API, turn your component into an asynchronous function, and await the `fetch` call. For example:

```tsx filename="app/blog/page.tsx" switcher
export default async function Page() {
  const data = await fetch('https://api.vercel.app/blog')
  const posts = await data.json()
  return (
    <ul>
      {posts.map((post) => (
        <li key={post.id}>{post.title}</li>
      ))}
    </ul>
  )
}
```

```jsx filename="app/blog/page.js" switcher
export default async function Page() {
  const data = await fetch('https://api.vercel.app/blog')
  const posts = await data.json()
  return (
    <ul>
      {posts.map((post) => (
        <li key={post.id}>{post.title}</li>
      ))}
    </ul>
  )
}
```

> **Good to know:**
>
> - Identical `fetch` requests in a React component tree are [memoized](/docs/app/glossary#memoization) by default, so you can fetch data in the component that needs it instead of drilling props.
> - `fetch` requests are not cached by default and will block the page from rendering until the request is complete. Use the [`use cache`](/docs/app/api-reference/directives/use-cache) directive to cache results, or wrap the fetching component in [`<Suspense>`](/docs/app/getting-started/caching#streaming-uncached-data) to stream fresh data at request time. See [caching](/docs/app/getting-started/caching) for details.
> - During development, you can log `fetch` calls for better visibility and debugging. See the [`logging` API reference](/docs/app/api-reference/config/next-config-js/logging).

#### With an ORM or database

Since Server Components are rendered on the server, credentials and query logic will not be included in the client bundle so you can safely make database queries using an ORM or database client.

```tsx filename="app/blog/page.tsx" switcher
import { db, posts } from '@/lib/db'

export default async function Page() {
  const allPosts = await db.select().from(posts)
  return (
    <ul>
      {allPosts.map((post) => (
        <li key={post.id}>{post.title}</li>
      ))}
    </ul>
  )
}
```

```jsx filename="app/blog/page.js" switcher
import { db, posts } from '@/lib/db'

export default async function Page() {
  const allPosts = await db.select().from(posts)
  return (
    <ul>
      {allPosts.map((post) => (
        <li key={post.id}>{post.title}</li>
      ))}
    </ul>
  )
}
```

You should still ensure requests are properly authenticated and authorized. For best practices on securing server-side data access, see the [data security guide](/docs/app/guides/data-security).

### Streaming

When you fetch data in Server Components, the data is fetched and rendered on the server for each request. If you have any slow data requests, the whole route will be blocked from rendering until all the data is fetched.

To improve the initial load time and user experience, you can break the page into smaller _chunks_ and progressively send those chunks from the server to the client. This is called streaming. See the [Streaming guide](/docs/app/guides/streaming) for a deeper look at how streaming works, including the HTTP contract, infrastructure considerations, and performance trade-offs.

<Image
  alt="How Server Rendering with Streaming Works"
  srcLight="/docs/light/server-rendering-with-streaming.png"
  srcDark="/docs/dark/server-rendering-with-streaming.png"
  width="1600"
  height="785"
/>

There are two ways you can use streaming in your application:

1. Wrapping a page with a [`loading.js` file](#with-loadingjs)
2. Wrapping a component with [`<Suspense>`](#with-suspense)

#### With `loading.js`

You can create a `loading.js` file in the same folder as your page to stream the **entire page** while the data is being fetched. For example, to stream `app/blog/page.js`, add the file inside the `app/blog` folder.

<Image
  alt="Blog folder structure with loading.js file"
  srcLight="/docs/light/loading-file.png"
  srcDark="/docs/dark/loading-file.png"
  width="1600"
  height="525"
/>

```tsx filename="app/blog/loading.tsx" switcher
export default function Loading() {
  // Define the Loading UI here
  return <div>Loading...</div>
}
```

```jsx filename="app/blog/loading.js" switcher
export default function Loading() {
  // Define the Loading UI here
  return <div>Loading...</div>
}
```

On navigation, the user will immediately see the layout and a [loading state](#creating-meaningful-loading-states) while the page is being rendered. The new content will then be automatically swapped in once rendering is complete.

<Image
  alt="Loading UI"
  srcLight="/docs/light/loading-ui.png"
  srcDark="/docs/dark/loading-ui.png"
  width="1600"
  height="691"
/>

Behind the scenes, `loading.js` will be [nested inside `layout.js`](/docs/app/getting-started/project-structure#component-hierarchy), and will automatically wrap the `page.js` file and any children below in a `<Suspense>` boundary.

<Image
  alt="loading.js overview"
  srcLight="/docs/light/loading-overview.png"
  srcDark="/docs/dark/loading-overview.png"
  width="1600"
  height="768"
/>

Because of this, a layout that accesses uncached or runtime data (e.g. `cookies()`, `headers()`, or uncached fetches) does not fall back to a same route segment `loading.js`. Instead, it blocks navigation until the layout finishes rendering. [Cache Components](/docs/app/getting-started/caching) prevents this by guiding you with a build-time error.

To fix this, wrap the uncached access in its own [`<Suspense>`](#with-suspense) boundary with a fallback, or move the data fetching into `page.js` where `loading.js` can cover it. See [`loading.js`](/docs/app/api-reference/file-conventions/loading) for more details.

This is why, while `loading.js` works well for streaming route segments, using `<Suspense>` closer to the runtime or uncached data access is recommended.

#### With `<Suspense>`

`<Suspense>` allows you to be more granular about what parts of the page to stream. For example, you can immediately show any page content that falls outside of the `<Suspense>` boundary, and stream in the list of blog posts inside the boundary.

```tsx filename="app/blog/page.tsx" switcher
import { Suspense } from 'react'
import BlogList from '@/components/BlogList'
import BlogListSkeleton from '@/components/BlogListSkeleton'

export default function BlogPage() {
  return (
    <div>
      {/* This content will be sent to the client immediately */}
      <header>
        <h1>Welcome to the Blog</h1>
        <p>Read the latest posts below.</p>
      </header>
      <main>
        {/* If there's any dynamic content inside this boundary, it will be streamed in */}
        <Suspense fallback={<BlogListSkeleton />}>
          <BlogList />
        </Suspense>
      </main>
    </div>
  )
}
```

```jsx filename="app/blog/page.js" switcher
import { Suspense } from 'react'
import BlogList from '@/components/BlogList'
import BlogListSkeleton from '@/components/BlogListSkeleton'

export default function BlogPage() {
  return (
    <div>
      {/* This content will be sent to the client immediately */}
      <header>
        <h1>Welcome to the Blog</h1>
        <p>Read the latest posts below.</p>
      </header>
      <main>
        {/* If there's any dynamic content inside this boundary, it will be streamed in */}
        <Suspense fallback={<BlogListSkeleton />}>
          <BlogList />
        </Suspense>
      </main>
    </div>
  )
}
```

#### Creating meaningful loading states

An instant loading state is fallback UI that is shown immediately to the user after navigation. For the best user experience, we recommend designing loading states that are meaningful and help users understand the app is responding. For example, you can use skeletons and spinners, or a small but meaningful part of future screens such as a cover photo, title, etc.

In development, you can preview and inspect the loading state of your components using the [React Devtools](https://react.dev/learn/react-developer-tools).

### Client Components

There are two ways to fetch data in Client Components, using:

1. React's [`use` API](https://react.dev/reference/react/use)
2. A community library like [SWR](https://swr.vercel.app/) or [React Query](https://tanstack.com/query/latest)

#### Streaming data with the `use` API

You can use React's [`use` API](https://react.dev/reference/react/use) to [stream](#streaming) data from the server to client. Start by fetching data in your Server component, and pass the promise to your Client Component as prop:

```tsx filename="app/blog/page.tsx" switcher
import Posts from '@/app/ui/posts'
import { Suspense } from 'react'

export default function Page() {
  // Don't await the data fetching function
  const posts = getPosts()

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <Posts posts={posts} />
    </Suspense>
  )
}
```

```jsx filename="app/blog/page.js" switcher
import Posts from '@/app/ui/posts'
import { Suspense } from 'react'

export default function Page() {
  // Don't await the data fetching function
  const posts = getPosts()

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <Posts posts={posts} />
    </Suspense>
  )
}
```

Then, in your Client Component, use the `use` API to read the promise:

```tsx filename="app/ui/posts.tsx" switcher
'use client'
import { use } from 'react'

export default function Posts({
  posts,
}: {
  posts: Promise<{ id: string; title: string }[]>
}) {
  const allPosts = use(posts)

  return (
    <ul>
      {allPosts.map((post) => (
        <li key={post.id}>{post.title}</li>
      ))}
    </ul>
  )
}
```

```jsx filename="app/ui/posts.js" switcher
'use client'
import { use } from 'react'

export default function Posts({ posts }) {
  const allPosts = use(posts)

  return (
    <ul>
      {allPosts.map((post) => (
        <li key={post.id}>{post.title}</li>
      ))}
    </ul>
  )
}
```

In the example above, the `<Posts>` component is wrapped in a [`<Suspense>` boundary](https://react.dev/reference/react/Suspense). This means the fallback will be shown while the promise is being resolved. Learn more about [streaming](#streaming).

#### Community libraries

You can use a community library like [SWR](https://swr.vercel.app/) or [React Query](https://tanstack.com/query/latest) to fetch data in Client Components. These libraries have their own semantics for caching, streaming, and other features. For example, with SWR:

```tsx filename="app/blog/page.tsx" switcher
'use client'
import useSWR from 'swr'

const fetcher = (url) => fetch(url).then((r) => r.json())

export default function BlogPage() {
  const { data, error, isLoading } = useSWR(
    'https://api.vercel.app/blog',
    fetcher
  )

  if (isLoading) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>

  return (
    <ul>
      {data.map((post: { id: string; title: string }) => (
        <li key={post.id}>{post.title}</li>
      ))}
    </ul>
  )
}
```

```jsx filename="app/blog/page.js" switcher
'use client'

import useSWR from 'swr'

const fetcher = (url) => fetch(url).then((r) => r.json())

export default function BlogPage() {
  const { data, error, isLoading } = useSWR(
    'https://api.vercel.app/blog',
    fetcher
  )

  if (isLoading) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>

  return (
    <ul>
      {data.map((post) => (
        <li key={post.id}>{post.title}</li>
      ))}
    </ul>
  )
}
```

## Examples

### Sequential data fetching

Sequential data fetching happens when one request depends on data from another.

For example, `<Playlists>` can only fetch data after `<Artist>` completes because it needs the `artistID`:

```tsx filename="app/artist/[username]/page.tsx" switcher
export default async function Page({
  params,
}: {
  params: Promise<{ username: string }>
}) {
  const { username } = await params
  // Get artist information
  const artist = await getArtist(username)

  return (
    <>
      <h1>{artist.name}</h1>
      {/* Show fallback UI while the Playlists component is loading */}
      <Suspense fallback={<div>Loading...</div>}>
        {/* Pass the artist ID to the Playlists component */}
        <Playlists artistID={artist.id} />
      </Suspense>
    </>
  )
}

async function Playlists({ artistID }: { artistID: string }) {
  // Use the artist ID to fetch playlists
  const playlists = await getArtistPlaylists(artistID)

  return (
    <ul>
      {playlists.map((playlist) => (
        <li key={playlist.id}>{playlist.name}</li>
      ))}
    </ul>
  )
}
```

```jsx filename="app/artist/[username]/page.js" switcher
export default async function Page({ params }) {
  const { username } = await params
  // Get artist information
  const artist = await getArtist(username)

  return (
    <>
      <h1>{artist.name}</h1>
      {/* Show fallback UI while the Playlists component is loading */}
      <Suspense fallback={<div>Loading...</div>}>
        {/* Pass the artist ID to the Playlists component */}
        <Playlists artistID={artist.id} />
      </Suspense>
    </>
  )
}

async function Playlists({ artistID }) {
  // Use the artist ID to fetch playlists
  const playlists = await getArtistPlaylists(artistID)

  return (
    <ul>
      {playlists.map((playlist) => (
        <li key={playlist.id}>{playlist.name}</li>
      ))}
    </ul>
  )
}
```

In this example, `<Suspense>` allows the playlists to stream in after the artist data loads. However, the page still waits for the artist data before displaying anything. To prevent this, you can wrap the entire page component in a `<Suspense>` boundary (for example, using a [`loading.js` file](#with-loadingjs)) to show a loading state immediately.

Ensure your data source can resolve the first request quickly, as it blocks everything else. If you can't optimize the request further, consider [caching](/docs/app/getting-started/caching) the result if the data changes infrequently.

### Parallel data fetching

Parallel data fetching happens when data requests in a route are eagerly initiated and start at the same time.

By default, [layouts and pages](/docs/app/getting-started/layouts-and-pages) are rendered in parallel. So each segment starts fetching data as soon as possible.

However, within _any_ component, multiple `async`/`await` requests can still be sequential if placed after the other. For example, `getAlbums` will be blocked until `getArtist` is resolved:

```tsx filename="app/artist/[username]/page.tsx" switcher
import { getArtist, getAlbums } from '@/app/lib/data'

export default async function Page({ params }) {
  // These requests will be sequential
  const { username } = await params
  const artist = await getArtist(username)
  const albums = await getAlbums(username)
  return <div>{artist.name}</div>
}
```

Start multiple requests by calling `fetch`, then await them with [`Promise.all`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/all). Requests begin as soon as `fetch` is called.

```tsx filename="app/artist/[username]/page.tsx" highlight={3,8,24} switcher
import Albums from './albums'

async function getArtist(username: string) {
  const res = await fetch(`https://api.example.com/artist/${username}`)
  return res.json()
}

async function getAlbums(username: string) {
  const res = await fetch(`https://api.example.com/artist/${username}/albums`)
  return res.json()
}

export default async function Page({
  params,
}: {
  params: Promise<{ username: string }>
}) {
  const { username } = await params

  // Initiate requests
  const artistData = getArtist(username)
  const albumsData = getAlbums(username)

  const [artist, albums] = await Promise.all([artistData, albumsData])

  return (
    <>
      <h1>{artist.name}</h1>
      <Albums list={albums} />
    </>
  )
}
```

```jsx filename="app/artist/[username]/page.js" highlight={3,8,20} switcher
import Albums from './albums'

async function getArtist(username) {
  const res = await fetch(`https://api.example.com/artist/${username}`)
  return res.json()
}

async function getAlbums(username) {
  const res = await fetch(`https://api.example.com/artist/${username}/albums`)
  return res.json()
}

export default async function Page({ params }) {
  const { username } = await params

  // Initiate requests
  const artistData = getArtist(username)
  const albumsData = getAlbums(username)

  const [artist, albums] = await Promise.all([artistData, albumsData])

  return (
    <>
      <h1>{artist.name}</h1>
      <Albums list={albums} />
    </>
  )
}
```

> **Good to know:** If one request fails when using `Promise.all`, the entire operation will fail. To handle this, you can use the [`Promise.allSettled`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/allSettled) method instead.

### Sharing data with context and `React.cache`

You can share fetched data across both Server and Client Components by combining [`React.cache`](https://react.dev/reference/react/cache) with context providers.

Create a cached function that fetches data:

```ts filename="app/lib/user.ts" switcher
import { cache } from 'react'

export const getUser = cache(async () => {
  const res = await fetch('https://api.example.com/user')
  return res.json()
})
```

```js filename="app/lib/user.js" switcher
import { cache } from 'react'

export const getUser = cache(async () => {
  const res = await fetch('https://api.example.com/user')
  return res.json()
})
```

Create a context provider that stores the promise:

```tsx filename="app/user-provider.tsx" switcher
'use client'

import { createContext } from 'react'

type User = {
  id: string
  name: string
}

export const UserContext = createContext<Promise<User> | null>(null)

export default function UserProvider({
  children,
  userPromise,
}: {
  children: React.ReactNode
  userPromise: Promise<User>
}) {
  return <UserContext value={userPromise}>{children}</UserContext>
}
```

```jsx filename="app/user-provider.js" switcher
'use client'

import { createContext } from 'react'

export const UserContext = createContext(null)

export default function UserProvider({ children, userPromise }) {
  return <UserContext value={userPromise}>{children}</UserContext>
}
```

In a layout, pass the promise to the provider without awaiting:

```tsx filename="app/layout.tsx" switcher
import UserProvider from './user-provider'
import { getUser } from './lib/user'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const userPromise = getUser() // Don't await

  return (
    <html>
      <body>
        <UserProvider userPromise={userPromise}>{children}</UserProvider>
      </body>
    </html>
  )
}
```

```jsx filename="app/layout.js" switcher
import UserProvider from './user-provider'
import { getUser } from './lib/user'

export default function RootLayout({ children }) {
  const userPromise = getUser() // Don't await

  return (
    <html>
      <body>
        <UserProvider userPromise={userPromise}>{children}</UserProvider>
      </body>
    </html>
  )
}
```

Client Components use [`use()`](https://react.dev/reference/react/use) to resolve the promise from context, wrapped in `<Suspense>` for fallback UI:

```tsx filename="app/ui/profile.tsx" switcher
'use client'

import { use, useContext } from 'react'
import { UserContext } from '../user-provider'

export function Profile() {
  const userPromise = useContext(UserContext)
  if (!userPromise) {
    throw new Error('useContext must be used within a UserProvider')
  }
  const user = use(userPromise)
  return <p>Welcome, {user.name}</p>
}
```

```jsx filename="app/ui/profile.js" switcher
'use client'

import { use, useContext } from 'react'
import { UserContext } from '../user-provider'

export function Profile() {
  const userPromise = useContext(UserContext)
  if (!userPromise) {
    throw new Error('useContext must be used within a UserProvider')
  }
  const user = use(userPromise)
  return <p>Welcome, {user.name}</p>
}
```

```tsx filename="app/page.tsx" switcher
import { Suspense } from 'react'
import { Profile } from './ui/profile'

export default function Page() {
  return (
    <Suspense fallback={<div>Loading profile...</div>}>
      <Profile />
    </Suspense>
  )
}
```

```jsx filename="app/page.js" switcher
import { Suspense } from 'react'
import { Profile } from './ui/profile'

export default function Page() {
  return (
    <Suspense fallback={<div>Loading profile...</div>}>
      <Profile />
    </Suspense>
  )
}
```

Server Components can also call `getUser()` directly:

```tsx filename="app/dashboard/page.tsx" switcher
import { getUser } from '../lib/user'

export default async function DashboardPage() {
  const user = await getUser() // Cached - same request, no duplicate fetch
  return <h1>Dashboard for {user.name}</h1>
}
```

```jsx filename="app/dashboard/page.js" switcher
import { getUser } from '../lib/user'

export default async function DashboardPage() {
  const user = await getUser() // Cached - same request, no duplicate fetch
  return <h1>Dashboard for {user.name}</h1>
}
```

Since `getUser` is wrapped with `React.cache`, multiple calls within the same request return the same memoized result, whether called directly in Server Components or resolved via context in Client Components.

> **Good to know**: `React.cache` is scoped to the current request only. Each request gets its own memoization scope with no sharing between requests.
