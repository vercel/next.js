---
title: Server Actions and Mutations
nav_title: Server Actions
description: How Server Actions work in Next.js, including the single-roundtrip response model, sequential dispatch, security, and caching integration.
related:
  title: Next steps
  description: Learn more about creating, securing, and configuring Server Actions.
  links:
    - app/getting-started/mutating-data
    - app/guides/forms
    - app/guides/data-security
    - app/api-reference/directives/use-server
    - app/api-reference/functions/revalidatePath
    - app/api-reference/functions/revalidateTag
    - app/api-reference/functions/redirect
    - app/api-reference/functions/refresh
    - app/api-reference/config/next-config-js/serverActions
---

A **Server Action** is a [React Server Function](https://react.dev/reference/rsc/server-functions) invoked through React's action mechanisms, such as `<form action>`, `<button formAction>`, or a client-side transition.

You create one by adding the [`'use server'`](/docs/app/api-reference/directives/use-server) directive, then invoke it from a form, or from an event handler or `useEffect` wrapped in `startTransition`. For the basics of creating and invoking Server Functions, see [Mutating data](/docs/app/getting-started/mutating-data) and the [Forms guide](/docs/app/guides/forms).

This page covers the parts of Server Actions that are specific to Next.js: how they commonly map to mutations, how the response carries both returned data and re-rendered UI, how the client dispatches them, the security boundary the framework enforces, and the configuration available.

## Sequential dispatch on the client

Next.js dispatches Server Actions one at a time per client. If a user triggers three actions in quick succession, the second waits for the first to finish, then the third waits for the second. This keeps the re-rendered server tree consistent with the action result that produced it.

A consequence: do not rely on `Promise.all` to parallelize Server Actions from the client. If you need parallel work, do it inside a single Server Action, fetch in parallel from a [Server Component](/docs/app/getting-started/fetching-data#server-components), or use a [Route Handler](/docs/app/guides/backend-for-frontend#manipulating-data) for non-mutation requests.

> **Good to know:** This is a property of the client dispatcher, not of Server Functions in general. Server-side, an action runs in its own request and can do anything an async function can do.

## A single response carries data and UI

When a Server Action triggers an immediate revalidation, Next.js does the work inside one HTTP request: it runs the action, then re-renders the current route server-side. The response that comes back contains both pieces in the same Flight stream:

- The action's return value, consumed by `useActionState` or the awaited promise on the client.
- A newly rendered [RSC Payload](/docs/app/glossary#rsc-payload) for the current route, which the client commits as a seeded navigation.

Your application code does not need a follow-up fetch to see the updated UI for the current page.

A re-render is included in the same response when the action does any of these:

- Calls [`updateTag`](/docs/app/api-reference/functions/updateTag) or [`revalidatePath`](/docs/app/api-reference/functions/revalidatePath) to immediately invalidate cached data.
- Calls [`refresh`](/docs/app/api-reference/functions/refresh) to refetch the current route's RSC Payload.
- Mutates cookies through [`cookies()`](/docs/app/api-reference/functions/cookies#understanding-cookie-behavior-in-server-functions). Setting or deleting a cookie automatically re-renders the current page so the UI reflects the new value.
- Calls [`redirect`](/docs/app/api-reference/functions/redirect). The response navigates the router and streams the destination's RSC Payload.

```ts filename="app/posts/actions.ts"
'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

export async function createPost(formData: FormData) {
  const session = await auth()
  if (!session?.user) throw new Error('Unauthorized')

  await db.post.create({
    data: {
      title: String(formData.get('title')),
      authorId: session.user.id,
    },
  })

  revalidatePath('/posts')
}
```

The mutation, the cache invalidation, and the page re-render all complete in a single roundtrip. Because [`redirect`](/docs/app/api-reference/functions/redirect#behavior) throws a control-flow exception, any code after it does not run. Place revalidation calls before `redirect` if the destination needs the fresh data.

[`revalidateTag`](/docs/app/api-reference/functions/revalidateTag) with a stale-while-revalidate profile is the exception: it marks the tag for background refresh and does **not** include a re-render in the action response. The page reflects the change on a later read. An action that does none of the above carries only its return value, and the current route is not re-rendered.

## Security

A Server Action runs as a POST request against the page that invokes it. At build time, the `'use server'` directive tells the compiler to swap the function's implementation in client bundles for a reference (an action ID plus a dispatcher) that POSTs back to the server. The implementation stays on the server, but the route is reachable to anyone who can send the same POST. Treat every action as an untrusted entry point.

Next.js enforces a few framework-level protections:

- **CSRF check.** The request's `Origin` is compared to the `Host` (or `X-Forwarded-Host`). Mismatches are rejected. Configure [`serverActions.allowedOrigins`](/docs/app/api-reference/config/next-config-js/serverActions#allowedorigins) for proxy or CDN domains.
- **Body size limit.** Action requests are capped at 1MB by default. Configure [`serverActions.bodySizeLimit`](/docs/app/api-reference/config/next-config-js/serverActions#bodysizelimit) when accepting larger payloads.
- **Encrypted action IDs and dead code elimination.** Action references are encrypted at build time, and unused Server Functions are stripped from client bundles so they have no public endpoint. See [Built-in Server Actions security features](/docs/app/guides/data-security#built-in-server-actions-security-features).
- **Closure variable encryption.** Variables captured by an inline action are encrypted before being sent to the client. For multi-instance and self-hosted deployments, set `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` to a stable key shared across instances. See [Closures and encryption](/docs/app/guides/data-security#closures-and-encryption).

Framework protections are not a substitute for application-level checks. Inside every action:

- **Authenticate and authorize.** Render-time gating (only rendering a form on an authenticated page) is not a security boundary, because requests can be sent without going through the UI.
- **Validate inputs.** Treat `FormData`, query parameters, and headers as untrusted.
- **Constrain return values.** Action returns are serialized to the client. Shape them to what the UI renders, not raw database records.

For end-to-end patterns including a Data Access Layer, return-value tainting, and rate limiting, see the [Data Security guide](/docs/app/guides/data-security#mutating-data).

Destructive operations like deletes may warrant stronger handling, such as elevated session checks or re-authentication, and a loud failure when those checks miss.

```ts filename="app/posts/actions.ts" highlight={6,7,8}
'use server'

import { auth } from '@/lib/auth'

export async function deletePost(postId: string) {
  const session = await auth()
  if (!session?.user) throw new Error('Unauthorized')
  if (!(await canDelete(session.user, postId))) throw new Error('Forbidden')

  await db.post.delete({ where: { id: postId } })
}
```

If you've enabled the experimental [`authInterrupts`](/docs/app/api-reference/config/next-config-js/authInterrupts) flag, you can throw [`unauthorized()`](/docs/app/api-reference/functions/unauthorized) and [`forbidden()`](/docs/app/api-reference/functions/forbidden) from `next/navigation` instead, so Next.js renders the corresponding `unauthorized.tsx` / `forbidden.tsx` UI segment automatically.

For example, a client legitimately tells the server _which_ item to act on, but it should not supply the row's contents or ownership. Send a reference (typically an ID) plus the user's change, and re-read the rest from a trusted source using the session. Schema validation (zod or similar) only checks the _shape_ of the input. A well-formed `Item` object can still refer to a row the caller does not own.

```ts filename="app/items/actions.ts"
'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

// Unsafe: no auth, no ownership check. The whole item, including its id, comes
// from the client, so anyone who can POST here can mark any item complete.
export async function completeItemUnsafe(item: Item) {
  await db.item.update({ where: { id: item.id }, data: { completed: true } })
}

// Safe: take only the change, derive identity from the session, look up by ownership.
export async function completeItem(itemId: string) {
  const session = await auth()
  if (!session?.user) return

  const item = await db.item.findFirst({
    where: { id: itemId, ownerId: session.user.id },
  })
  if (!item) return

  await db.item.update({ where: { id: item.id }, data: { completed: true } })
}
```

## Choosing a cache update

After mutating data, on-demand revalidation updates the server cache, the client router, or both. Choose based on what needs to change:

- [`updateTag`](/docs/app/api-reference/functions/updateTag): immediate expiration of a tag. The next read (including the route re-render that ships with the action's response) waits for fresh data. Use when the action needs **read-your-own-writes** so the user immediately sees their change. Server Actions only.
- [`revalidateTag`](/docs/app/api-reference/functions/revalidateTag): stale-while-revalidate refresh of a tag with a cache-life profile. Subsequent reads get the stale value while a fresh fetch happens in the background, so the action's own re-render does **not** wait for the new data.
- [`revalidatePath`](/docs/app/api-reference/functions/revalidatePath): invalidate by URL path. Use when one route is affected and tagging is overkill.
- [`refresh`](/docs/app/api-reference/functions/refresh): refetch the current route's RSC Payload without invalidating cached data. Use when the view depends on state outside the cache that the action just changed.

When `updateTag`, `revalidatePath`, or `refresh` runs, Next.js re-renders the current route server-side and includes a newly rendered [RSC Payload](/docs/app/glossary#rsc-payload) in the action's response, so the page reflects the change in the same roundtrip. `revalidateTag` with a stale-while-revalidate profile intentionally skips that immediate re-render.

Unlike [`redirect`](/docs/app/api-reference/functions/redirect), none of these throw, so an action can call them and still return a value to the caller. See [How revalidation works](/docs/app/guides/how-revalidation-works) for the underlying model.

## Configuration

The [`serverActions`](/docs/app/api-reference/config/next-config-js/serverActions) option in `next.config.js` controls framework-level behavior:

```js filename="next.config.js"
/** @type {import('next').NextConfig} */
module.exports = {
  experimental: {
    serverActions: {
      allowedOrigins: ['my-proxy.com', '*.my-proxy.com'],
      bodySizeLimit: '2mb',
    },
  },
}
```

For the closure encryption key, set `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` in the deployment environment. See [Self-hosting: Server Functions encryption key](/docs/app/guides/self-hosting#server-functions-encryption-key) for deployment-specific guidance.

## Deployment considerations

Each Server Action is identified by the [action ID](#security) that is part of its build artifacts. New deployments typically generate new IDs (Next.js rotates them at most every 14 days, even when the source is unchanged), so a client still running the previous build may invoke an action ID that no longer exists. The error surfaces as "[Failed to find Server Action](https://nextjs.org/docs/messages/failed-to-find-server-action)".

To minimize disruption:

- Prefer rolling deployments over abrupt cutovers when active users are likely to be mid-mutation.
- Keep `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` stable across instances so action references remain decryptable everywhere.
- Surface the error as a retry path in the UI rather than a hard failure, so a refresh recovers the user.
