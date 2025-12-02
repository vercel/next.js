---
title: updateTag
description: API Reference for the updateTag function.
---

`updateTag` allows you to update [cached data](/docs/app/guides/caching) on-demand for a specific cache tag from within [Server Actions](/docs/app/getting-started/updating-data).

This function is designed for **read-your-own-writes** scenarios, where a user makes a change (like creating a post), and the UI immediately shows the change, rather than stale data.

## Usage

`updateTag` can **only** be called from within [Server Actions](/docs/app/getting-started/updating-data). It cannot be used in Route Handlers, Client Components, or any other context.

If you need to invalidate cache tags in Route Handlers or other contexts, use [`revalidateTag`](/docs/app/api-reference/functions/revalidateTag) instead.

> **Good to know**: `updateTag` immediately expires the cached data for the specified tag. The next request will wait to fetch fresh data rather than serving stale content from the cache, ensuring users see their changes immediately.

## Parameters

```tsx
updateTag(tag: string): void;
```

- `tag`: A string representing the cache tag associated with the data you want to update. Must not exceed 256 characters. This value is case-sensitive.

Tags must first be assigned to cached data. You can do this in two ways:

- Using the [`next.tags`](/docs/app/guides/caching#fetch-optionsnexttags-and-revalidatetag) option with `fetch` for caching external API requests:

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

## Returns

`updateTag` does not return a value.

## Differences from revalidateTag

While both `updateTag` and `revalidateTag` invalidate cached data, they serve different purposes:

- **`updateTag`**:
  - Can only be used in Server Actions
  - Next request waits for fresh data (no stale content served)
  - Designed for read-your-own-writes scenarios

- **`revalidateTag`**:
  - Can be used in Server Actions and Route Handlers
  - With `profile="max"` (recommended): Serves cached data while fetching fresh data in the background (stale-while-revalidate)
  - With custom profile: Can be configured to any cache life profile for advanced usage
  - Without profile: legacy behavior which is equivalent to `updateTag`

## Examples

### Server Action with Read-Your-Own-Writes

```ts filename="app/actions.ts" switcher
'use server'

import { updateTag } from 'next/cache'
import { redirect } from 'next/navigation'

export async function createPost(formData: FormData) {
  const title = formData.get('title')
  const content = formData.get('content')

  // Create the post in your database
  const post = await db.post.create({
    data: { title, content },
  })

  // Invalidate cache tags so the new post is immediately visible
  // 'posts' tag: affects any page that displays a list of posts
  updateTag('posts')
  // 'post-{id}' tag: affects the individual post detail page
  updateTag(`post-${post.id}`)

  // Redirect to the new post - user will see fresh data, not cached
  redirect(`/posts/${post.id}`)
}
```

```js filename="app/actions.js" switcher
'use server'

import { updateTag } from 'next/cache'
import { redirect } from 'next/navigation'

export async function createPost(formData) {
  const title = formData.get('title')
  const content = formData.get('content')

  // Create the post in your database
  const post = await db.post.create({
    data: { title, content },
  })

  // Invalidate cache tags so the new post is immediately visible
  // 'posts' tag: affects any page that displays a list of posts
  updateTag('posts')
  // 'post-{id}' tag: affects the individual post detail page
  updateTag(`post-${post.id}`)

  // Redirect to the new post - user will see fresh data, not cached
  redirect(`/posts/${post.id}`)
}
```

### Error when used outside Server Actions

```ts filename="app/api/posts/route.ts" switcher
import { updateTag } from 'next/cache'

export async function POST() {
  // This will throw an error
  updateTag('posts')
  // Error: updateTag can only be called from within a Server Action

  // Use revalidateTag instead in Route Handlers
  revalidateTag('posts', 'max')
}
```

## When to use updateTag

Use `updateTag` when:

- You're in a Server Action
- You need immediate cache invalidation for read-your-own-writes
- You want to ensure the next request sees updated data

Use `revalidateTag` instead when:

- You're in a Route Handler or other non-action context
- You want stale-while-revalidate semantics
- You're building a webhook or API endpoint for cache invalidation

## Related

- [`revalidateTag`](/docs/app/api-reference/functions/revalidateTag) - For invalidating tags in Route Handlers
- [`revalidatePath`](/docs/app/api-reference/functions/revalidatePath) - For invalidating specific paths
