---
title: notFound
description: API Reference for the notFound function.
related:
  links:
    - app/api-reference/file-conventions/not-found
    - app/api-reference/functions/forbidden
    - app/api-reference/functions/unauthorized
---

The `notFound` function throws an error that renders a Next.js 404 page. It's useful for handling missing resources in your application. You can customize the UI using the [`not-found.js` file](/docs/app/api-reference/file-conventions/not-found).

Invoking `notFound()` throws a `NEXT_HTTP_ERROR_FALLBACK;404` error and terminates rendering of the route segment where it was thrown. Next.js also injects a `<meta name="robots" content="noindex" />` tag so the page is not indexed. Because it works by throwing, call it in the render path: a component, or a function a component `await`s. A call left in an un-awaited promise throws where nothing catches it, and no not-found UI renders (in development the server logs `⨯ unhandledRejection: NEXT_HTTP_ERROR_FALLBACK;404`).

`notFound()` can be invoked in [Server Components](/docs/app/getting-started/server-and-client-components), [Server Functions](/docs/app/getting-started/mutating-data), and [Route Handlers](/docs/app/api-reference/file-conventions/route).

```tsx filename="app/user/[id]/page.tsx" switcher
import { notFound } from 'next/navigation'

async function fetchUser(id: string) {
  const res = await fetch('https://...')
  if (!res.ok) return undefined
  return res.json()
}

export default async function Profile({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await fetchUser(id)

  if (!user) {
    notFound()
  }

  // ...
}
```

```jsx filename="app/user/[id]/page.js" switcher
import { notFound } from 'next/navigation'

async function fetchUser(id) {
  const res = await fetch('https://...')
  if (!res.ok) return undefined
  return res.json()
}

export default async function Profile({ params }) {
  const { id } = await params
  const user = await fetchUser(id)

  if (!user) {
    notFound()
  }

  // ...
}
```

## Good to know

You do not need to write `return notFound()`. Calling it is enough, because it throws an exception that stops function execution. TypeScript understands this from its [`never`](https://www.typescriptlang.org/docs/handbook/2/functions.html#never) return type, so a value you check first stays narrowed afterward:

```tsx
// fetchUser resolves to a user object, or undefined
const user = await fetchUser(id)

if (!user) {
  notFound()
}

// user is defined here
return <Profile user={user} />
```

Like any exception, it travels up the call stack until something catches it. A `try/catch` around the call suppresses it, and the not-found UI won't render. If you need to catch errors near the call, use [`unstable_rethrow`](/docs/app/api-reference/functions/unstable_rethrow) to let the interrupt through first.

## Examples

### Calling `notFound()` after streaming has started

To keep a page's shell and loading UI visible while data loads, do the existence check inside a component wrapped in [`<Suspense>`](https://react.dev/reference/react/Suspense) instead of blocking the whole route. The idiomatic place for the check is the data-access function itself, awaited by the component that needs the data:

```tsx filename="app/blog/[slug]/page.tsx" switcher highlight={8}
import { Suspense } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

async function getPost(slug: string) {
  const res = await fetch(`https://api.example.com/posts/${slug}`)
  if (res.status === 404) {
    notFound()
  }
  if (!res.ok) {
    throw new Error(`Failed to load post: ${res.status}`)
  }
  return res.json()
}

async function Article({ slug }: { slug: string }) {
  const post = await getPost(slug)
  return (
    <article>
      <h1>{post.title}</h1>
      <p>{post.content}</p>
    </article>
  )
}

export default async function PostPage({ params }: PageProps<'/blog/[slug]'>) {
  const { slug } = await params

  return (
    <section>
      <Link href="/blog">Blog</Link>
      <Suspense fallback={<p>Loading...</p>}>
        <Article slug={slug} />
      </Suspense>
    </section>
  )
}
```

```jsx filename="app/blog/[slug]/page.js" switcher highlight={8}
import { Suspense } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

async function getPost(slug) {
  const res = await fetch(`https://api.example.com/posts/${slug}`)
  if (res.status === 404) {
    notFound()
  }
  if (!res.ok) {
    throw new Error(`Failed to load post: ${res.status}`)
  }
  return res.json()
}

async function Article({ slug }) {
  const post = await getPost(slug)
  return (
    <article>
      <h1>{post.title}</h1>
      <p>{post.content}</p>
    </article>
  )
}

export default async function PostPage({ params }) {
  const { slug } = await params

  return (
    <section>
      <Link href="/blog">Blog</Link>
      <Suspense fallback={<p>Loading...</p>}>
        <Article slug={slug} />
      </Suspense>
    </section>
  )
}
```

When the post doesn't exist, `getPost` calls `notFound()`, which throws. Because this happens during rendering, the exception propagates to the nearest [`not-found`](/docs/app/api-reference/file-conventions/not-found) boundary, which renders in place of the streamed-in content, even though the page shell has already been sent.

Add a `not-found.tsx` alongside the route to define that UI. Without one, the nearest parent `not-found` boundary renders, falling back to Next.js's default 404 page:

```tsx filename="app/blog/[slug]/not-found.tsx" switcher
export default function NotFound() {
  return (
    <section>
      <h1>Post not found</h1>
      <p>The post you're looking for doesn't exist.</p>
    </section>
  )
}
```

```jsx filename="app/blog/[slug]/not-found.js" switcher
export default function NotFound() {
  return (
    <section>
      <h1>Post not found</h1>
      <p>The post you're looking for doesn't exist.</p>
    </section>
  )
}
```

The trade-off is the HTTP status code. Because the check runs inside the `<Suspense>` boundary, the response has already begun streaming as a `200`, and the status can't change once streaming has started. The `noindex` tag keeps a soft 404 out of search results. To return a real `404` status, the resource has to be checked before the response streams. With [Cache Components](/docs/app/getting-started/caching), every dynamic route streams a static shell first, so run that check in [`proxy`](/docs/app/api-reference/file-conventions/proxy) instead. See [Status codes](/docs/app/api-reference/file-conventions/loading#status-codes).

### Serving a 404 from a Route Handler

`notFound()` also works in a [Route Handler](/docs/app/api-reference/file-conventions/route), where it serves a `404` to the caller.

```tsx filename="app/api/posts/[slug]/route.ts" switcher
import { NextResponse } from 'next/server'
import { notFound } from 'next/navigation'

export async function GET(
  request: Request,
  { params }: RouteContext<'/api/posts/[slug]'>
) {
  const { slug } = await params
  const res = await fetch(`https://api.example.com/posts/${slug}`)
  if (!res.ok) {
    notFound()
  }
  return NextResponse.json(await res.json())
}
```

```jsx filename="app/api/posts/[slug]/route.js" switcher
import { NextResponse } from 'next/server'
import { notFound } from 'next/navigation'

export async function GET(request, { params }) {
  const { slug } = await params
  const res = await fetch(`https://api.example.com/posts/${slug}`)
  if (!res.ok) {
    notFound()
  }
  return NextResponse.json(await res.json())
}
```

## Version History

| Version   | Changes                |
| --------- | ---------------------- |
| `v13.0.0` | `notFound` introduced. |
