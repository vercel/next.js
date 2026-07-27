---
title: How to preview content with Draft Mode in Next.js
nav_title: Draft Mode
description: Bypass Next.js caching for a request so editors can preview unpublished content from a headless CMS.
related:
  title: Next Steps
  description: See the API reference for more information on how to use Draft Mode.
  links:
    - app/api-reference/functions/draft-mode
---

**Draft Mode** lets editors see how draft or in-progress content will render on your site, without waiting for revalidation. While an editor is in Draft Mode, cached or pre-rendered content is bypassed, and fetched from upstream sources directly. Other visitors continue to see the cached or pre-rendered version of the page.

Your data-fetching code does not need to change if your CMS serves draft and published content from the same URL. Otherwise, see [When your CMS uses a separate draft endpoint](#when-your-cms-uses-a-separate-draft-endpoint).

## What Draft Mode does

When Draft Mode is enabled for a request:

- `fetch()` calls skip the Next.js fetch cache and hit the network directly.
- Components and functions inside [`'use cache'`](/docs/app/api-reference/directives/use-cache) re-execute on every request, and their results are not saved to the cache.
- [`unstable_cache`](/docs/app/api-reference/functions/unstable_cache) reads and writes are bypassed in the same way.
- The page is excluded from the ISR response cache and is served with `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate`.

The effect applies whether the page is statically generated, served from cache, or revalidated through ISR.

## What this guide covers

This guide assumes:

- Your headless CMS supports configurable preview URLs (most do).
- The CMS opens a URL like `/api/draft?secret=XXX&slug=/posts/foo` in a new tab when an editor clicks "Preview". The secret is a shared token; the slug is the path to preview.
- Your Next.js app validates the secret, enables Draft Mode, and redirects to the slug.

With that contract in mind, the rest of this guide walks through:

1. Creating a Route Handler that enables Draft Mode by setting a cookie.
2. Securing that handler with the shared secret and slug from the CMS.
3. Rendering pages that read the latest draft.
4. Showing a preview banner with an exit form.

Then, depending on your setup:

- [Draft Mode with Cache Components](#draft-mode-with-cache-components) for surfacing the preview state from a `'use cache'` boundary.
- [When your CMS uses a separate draft endpoint](#when-your-cms-uses-a-separate-draft-endpoint) for branching the fetch URL on `isEnabled`.

> **Good to know:** `GET` is meant to be a safe, read-only method. Operations that affect future requests, like enabling Draft Mode via a cookie, should use `POST`. The entry handler uses `GET` because we're assuming a CMS preview integration: the CMS opens the URL in a new browser tab, which is a `GET` request. The exit flow in Step 4 uses `POST` (via [Server Action](/docs/app/getting-started/mutating-data) or `POST` Route Handler).

## Step 1: Create a Route Handler

Create a [Route Handler](/docs/app/api-reference/file-conventions/route) that sets the Draft Mode cookie. It can have any name, for example, `app/api/draft/route.ts`.

```ts filename="app/api/draft/route.ts" switcher
import { draftMode } from 'next/headers'

export async function GET(request: Request) {
  const draft = await draftMode()
  draft.enable()
  return new Response('Draft mode is enabled')
}
```

```js filename="app/api/draft/route.js" switcher
import { draftMode } from 'next/headers'

export async function GET(request) {
  const draft = await draftMode()
  draft.enable()
  return new Response('Draft mode is enabled')
}
```

`draft.enable()` sets a cookie named `__prerender_bypass`. Subsequent requests that carry this cookie skip every cache layer listed above.

You can test this manually by visiting `/api/draft` and looking at your browser's developer tools. Notice the `Set-Cookie` response header.

As written, the handler is public: anyone who hits `/api/draft` enables Draft Mode for themselves. Step 2 closes that with a shared secret so only your CMS can call it.

## Step 2: Access the Route Handler from your headless CMS

> These steps assume that the headless CMS you're using supports setting **custom draft URLs**. If it doesn't, you can still use this method to secure your draft URLs, but you'll need to construct and access the draft URL manually. The specific steps will vary depending on which headless CMS you're using.

To securely access the Route Handler from your headless CMS:

1. Create a **secret token string** using a token generator of your choice. This secret is only known to your Next.js app and your headless CMS.
2. If your headless CMS supports setting custom draft URLs, specify a draft URL (this assumes that your Route Handler is located at `app/api/draft/route.ts`). For example:

```bash filename="Terminal"
https://<your-site>/api/draft?secret=<token>&slug=<path>
```

> - `<your-site>` should be your deployment domain.
> - `<token>` should be replaced with the secret token you generated.
> - `<path>` should be the path for the page that you want to view. If you want to view `/posts/one`, then you should use `&slug=/posts/one`.
>
> Your headless CMS might allow you to include a variable in the draft URL so that `<path>` can be set dynamically based on the CMS's data like so: `&slug=/posts/{entry.fields.slug}`

3. In your Route Handler, check that the secret matches and that the `slug` parameter exists (if not, the request should fail), call `draft.enable()` to set the cookie, then redirect the browser to the path specified by `slug`:

```ts filename="app/api/draft/route.ts" switcher
import { draftMode } from 'next/headers'
import { redirect } from 'next/navigation'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get('secret')
  const slug = searchParams.get('slug')

  // This secret should only be known to this Route Handler and the CMS
  if (secret !== 'MY_SECRET_TOKEN' || !slug) {
    return new Response('Invalid token', { status: 401 })
  }

  // Verify the slug exists in the CMS before enabling Draft Mode
  const post = await getPostBySlug(slug)
  if (!post) {
    return new Response('Invalid slug', { status: 401 })
  }

  const draft = await draftMode()
  draft.enable()

  // Redirect to the path from the fetched post, not from searchParams,
  // to avoid open redirect vulnerabilities
  redirect(post.slug)
}
```

```js filename="app/api/draft/route.js" switcher
import { draftMode } from 'next/headers'
import { redirect } from 'next/navigation'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get('secret')
  const slug = searchParams.get('slug')

  if (secret !== 'MY_SECRET_TOKEN' || !slug) {
    return new Response('Invalid token', { status: 401 })
  }

  const post = await getPostBySlug(slug)
  if (!post) {
    return new Response('Invalid slug', { status: 401 })
  }

  const draft = await draftMode()
  draft.enable()

  redirect(post.slug)
}
```

If it succeeds, the browser is redirected to the target path with the Draft Mode cookie set.

## Step 3: Preview the draft content

Because Draft Mode bypasses the cache automatically, your page does not need to know whether Draft Mode is on to receive fresh content. Fetch as you normally would:

```tsx filename="app/posts/[slug]/page.tsx" switcher
async function getPost(slug: string) {
  const res = await fetch(`https://cms.example.com/posts/${slug}`)
  return res.json()
}

export default async function Page({ params }: PageProps<'/posts/[slug]'>) {
  const { slug } = await params
  const post = await getPost(slug)

  return (
    <main>
      <h1>{post.title}</h1>
      <article>{post.content}</article>
    </main>
  )
}
```

```jsx filename="app/posts/[slug]/page.js" switcher
async function getPost(slug) {
  const res = await fetch(`https://cms.example.com/posts/${slug}`)
  return res.json()
}

export default async function Page({ params }) {
  const { slug } = await params
  const post = await getPost(slug)

  return (
    <main>
      <h1>{post.title}</h1>
      <article>{post.content}</article>
    </main>
  )
}
```

When the Draft Mode cookie is present, the `fetch` above skips the Next.js fetch cache and hits your CMS for the current draft. When it is not, the same request can be served from cache as usual.

If your CMS uses a different URL for drafts rather than serving them from the same endpoint, see [When your CMS uses a separate draft endpoint](#when-your-cms-uses-a-separate-draft-endpoint).

## Step 4: Show a preview indicator

`isEnabled` is most useful as a signal to the editor: a banner that confirms they are looking at draft content, plus a way to exit. Render an indicator from your root layout so it appears on every preview page.

```tsx filename="app/preview-banner.tsx" switcher
import { draftMode } from 'next/headers'
import { redirect } from 'next/navigation'

async function exitPreview() {
  'use server'
  const draft = await draftMode()
  draft.disable()
  redirect('/')
}

export async function PreviewBanner() {
  const { isEnabled } = await draftMode()
  if (!isEnabled) return null

  return (
    <aside role="status">
      Preview mode is on.{' '}
      <form action={exitPreview}>
        <button type="submit">Exit preview</button>
      </form>
    </aside>
  )
}
```

```jsx filename="app/preview-banner.js" switcher
import { draftMode } from 'next/headers'
import { redirect } from 'next/navigation'

async function exitPreview() {
  'use server'
  const draft = await draftMode()
  draft.disable()
  redirect('/')
}

export async function PreviewBanner() {
  const { isEnabled } = await draftMode()
  if (!isEnabled) return null

  return (
    <aside role="status">
      Preview mode is on.{' '}
      <form action={exitPreview}>
        <button type="submit">Exit preview</button>
      </form>
    </aside>
  )
}
```

Exiting Draft Mode also works with a `GET` Route Handler, but a `POST` is semantically more correct, for example via a form submitted through a [Server Action](/docs/app/getting-started/mutating-data) or to a `POST` Route Handler.

If you do use a `GET` Route Handler, trigger it from a `<form method="GET">` rather than a [`<Link>`](/docs/app/api-reference/components/link). Next.js prefetches `<Link>` components by default, which would clear the cookie before the editor clicks. Forms are not prefetched, regardless of method.

## Draft Mode with Cache Components

You can read `isEnabled` inside a [`'use cache'`](/docs/app/api-reference/directives/use-cache) scope to render a preview indicator from a cached component. The cache bypass still applies, so the component re-executes with fresh data on every draft request.

```tsx filename="app/posts/[slug]/page.tsx" switcher
import { draftMode } from 'next/headers'

async function Post({ slug }: { slug: string }) {
  'use cache'

  const post = await fetch(`https://cms.example.com/posts/${slug}`).then((r) =>
    r.json()
  )
  const { isEnabled } = await draftMode()

  return (
    <article>
      {isEnabled && <p role="status">Draft preview</p>}
      <h1>{post.title}</h1>
      <div>{post.content}</div>
    </article>
  )
}
```

```jsx filename="app/posts/[slug]/page.js" switcher
import { draftMode } from 'next/headers'

async function Post({ slug }) {
  'use cache'

  const post = await fetch(`https://cms.example.com/posts/${slug}`).then((r) =>
    r.json()
  )
  const { isEnabled } = await draftMode()

  return (
    <article>
      {isEnabled && <p role="status">Draft preview</p>}
      <h1>{post.title}</h1>
      <div>{post.content}</div>
    </article>
  )
}
```

> **Good to know:** `draftMode().enable()` and `draftMode().disable()` cannot be called inside a caching directive scope; toggle Draft Mode from a [Route Handler](/docs/app/api-reference/file-conventions/route) or [Server Action](/docs/app/getting-started/mutating-data) instead.

## When your CMS uses a separate draft endpoint

If your CMS exposes draft content at a different URL or requires different credentials, branch your fetch on `isEnabled`:

```tsx filename="app/posts/[slug]/page.tsx" switcher
import { draftMode } from 'next/headers'

async function getPost(slug: string) {
  const { isEnabled } = await draftMode()
  const baseUrl = isEnabled
    ? 'https://cms.example.com/preview'
    : 'https://cms.example.com/published'

  const res = await fetch(`${baseUrl}/posts/${slug}`)
  return res.json()
}
```

```jsx filename="app/posts/[slug]/page.js" switcher
import { draftMode } from 'next/headers'

async function getPost(slug) {
  const { isEnabled } = await draftMode()
  const baseUrl = isEnabled
    ? 'https://cms.example.com/preview'
    : 'https://cms.example.com/published'

  const res = await fetch(`${baseUrl}/posts/${slug}`)
  return res.json()
}
```

The cache bypass still applies to both branches; the fork only chooses where to read from.
