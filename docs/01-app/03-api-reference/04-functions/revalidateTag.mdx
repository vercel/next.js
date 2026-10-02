---
title: revalidateTag
description: API Reference for the revalidateTag function.
related:
  links:
    - app/guides/server-actions
---

`revalidateTag` allows you to invalidate cached data on-demand for a specific cache tag.

This function is ideal for content where a slight delay in updates is acceptable, such as blog posts, product catalogs, or documentation. With the recommended `max` profile, users receive stale content while fresh data loads in the background.

## Usage

`revalidateTag` can be called in Server Functions and Route Handlers.

`revalidateTag` cannot be called in Client Components or Proxy, as it only works in server environments.

### Revalidation Behavior

Calling `revalidateTag` marks the tagged data as stale. The next request for that data kicks off a revalidation and is served stale content while it runs, using stale-while-revalidate semantics. The second argument sets how long stale content may be served. Past that, a request blocks until the revalidation completes.

- **`profile="max"` (recommended)**: A one year window, long enough that requests are always served stale content while the revalidation runs.
- **Another profile, or an object**: Any other default or custom profile defined in [`cacheLife`](/docs/app/api-reference/config/next-config-js/cacheLife), or an object with an `expire` property, when you want a different window.
- **`{ expire: 0 }`**: Stale content is never served, so the next request is a blocking revalidate/cache miss. Use it when the caller needs the data gone immediately and you cannot use [`updateTag`](/docs/app/api-reference/functions/updateTag).
- **No second argument (deprecated)**: Behaves like `{ expire: 0 }`. Migrate to [`updateTag`](/docs/app/api-reference/functions/updateTag) in Server Actions, or `profile="max"`.

The profile sets the point past which data correctness is more important than being fast.

> **Good to know**: A revalidation is triggered by a request, not by the `revalidateTag` call, so pages using the tag revalidate as they are visited rather than all at once.

## Parameters

```ts
revalidateTag(tag: string, profile: string | { expire?: number }): void;
```

- `tag`: A string representing the cache tag associated with the data you want to revalidate. Tags are case-sensitive and must not exceed 256 characters. A tag that exceeds the limit is never assigned to cached data, so revalidating it does nothing.
- `profile`: How long stale content may be served, see [Revalidation Behavior](#revalidation-behavior). The recommended value is `"max"`. Any other default or custom profile defined in [`cacheLife`](/docs/app/api-reference/config/next-config-js/cacheLife) is also accepted, and only its `expire` is read. You can also pass an object with an `expire` property, in seconds.

Tags must first be assigned to cached data. You can do this in two ways:

- Using the [`next.tags`](/docs/app/api-reference/functions/fetch) option with `fetch` for caching external API requests:

```tsx
fetch(url, { next: { tags: ['posts'] } })
```

- Using [`cacheTag`](/docs/app/api-reference/functions/cacheTag) inside cached functions or components with the `'use cache'` directive:

```tsx
import { cacheTag } from 'next/cache'

async function getData() {
  'use cache'
  cacheTag('posts')
  // ...
}
```

> **Good to know**: The single-argument form `revalidateTag(tag)` is deprecated. It currently works if TypeScript errors are suppressed, but this behavior may be removed in a future version. Update to the two-argument signature.

## Returns

`revalidateTag` does not return a value.

## Relationship with `revalidatePath`

`revalidateTag` invalidates data with specific tags across all pages that use those tags, while [`revalidatePath`](/docs/app/api-reference/functions/revalidatePath) invalidates specific page or layout paths.

> **Good to know**: These functions serve different purposes and may need to be used together for comprehensive data consistency. For detailed examples and considerations, see [relationship with revalidateTag and updateTag](/docs/app/api-reference/functions/revalidatePath#relationship-with-revalidatetag-and-updatetag) for more information.

## Examples

The following examples demonstrate how to use `revalidateTag` in different contexts. In both cases, we're using `profile="max"` to mark data as stale and use stale-while-revalidate semantics, which is the recommended approach for most use cases.

### Server Action

```ts filename="app/actions.ts" switcher
'use server'

import { revalidateTag } from 'next/cache'

export default async function submit() {
  await addPost()
  revalidateTag('posts', 'max')
}
```

```js filename="app/actions.js" switcher
'use server'

import { revalidateTag } from 'next/cache'

export default async function submit() {
  await addPost()
  revalidateTag('posts', 'max')
}
```

### Route Handler

```ts filename="app/api/revalidate/route.ts" switcher
import type { NextRequest } from 'next/server'
import { revalidateTag } from 'next/cache'

export async function GET(request: NextRequest) {
  const tag = request.nextUrl.searchParams.get('tag')

  if (tag) {
    revalidateTag(tag, 'max')
    return Response.json({ revalidated: true, now: Date.now() })
  }

  return Response.json({
    revalidated: false,
    now: Date.now(),
    message: 'Missing tag to revalidate',
  })
}
```

```js filename="app/api/revalidate/route.js" switcher
import { revalidateTag } from 'next/cache'

export async function GET(request) {
  const tag = request.nextUrl.searchParams.get('tag')

  if (tag) {
    revalidateTag(tag, 'max')
    return Response.json({ revalidated: true, now: Date.now() })
  }

  return Response.json({
    revalidated: false,
    now: Date.now(),
    message: 'Missing tag to revalidate',
  })
}
```

When the invalidation comes from outside a Server Action, for example a webhook or another service calling a Route Handler, [`updateTag`](/docs/app/api-reference/functions/updateTag) is not available. Pass `{ expire: 0 }` to expire the data immediately:

```ts
revalidateTag(tag, { expire: 0 })
```
