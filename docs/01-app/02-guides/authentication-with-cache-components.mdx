---
title: How to implement authentication with Cache Components
nav_title: Authentication with Cache Components
description: 'Learn how to read the user session, show authenticated UI without slowing down the page, and cache data derived from the session when Cache Components is enabled.'
related:
  title: Next Steps
  description: Learn more about authentication, caching, and prefetching in Next.js.
  links:
    - app/guides/authentication
    - app/getting-started/caching
    - app/getting-started/fetching-data
    - app/guides/optimizing-prefetching
    - app/api-reference/directives/use-cache-private
    - app/api-reference/functions/cacheTag
    - app/api-reference/config/next-config-js/cacheComponents
---

With [Cache Components](/docs/app/getting-started/caching) enabled, a session read happens at request time, so it can't be prerendered into the static shell. Authenticated UI streams in behind a `<Suspense>` boundary instead, and data derived from the session can still be cached.

The examples use [iron-session](https://github.com/vvo/iron-session) for encrypted cookie sessions, but the patterns apply to any session or authentication library. For a complete, runnable version, see the [with-iron-session-cache-components example](https://github.com/vercel/next.js/tree/canary/examples/with-iron-session-cache-components).

## Prerequisites

Enable [`cacheComponents`](/docs/app/api-reference/config/next-config-js/cacheComponents):

```ts filename="next.config.ts"
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
}

export default nextConfig
```

This guide covers code patterns for authentication with Cache Components: reading the session at request time, streaming authenticated UI, and caching session-derived data. It assumes you're comfortable with Cache Components (if not, read [Caching](/docs/app/getting-started/caching) first) and that you already have a session set on login.

For the fundamentals this builds on, we recommend two guides:

- [Authentication](/docs/app/guides/authentication) covers sign-up, login, session management, authorization, and the Data Access Layer.
- [Data Security](/docs/app/guides/data-security) covers keeping data access on the server and sensitive data off the client.

## Migrating an existing app

With Cache Components enabled, instant navigation validation flags every route that reads the session, because a request read can't be prerendered into the static shell. You don't have to resolve them all before shipping. Set [`export const instant = false`](/docs/app/guides/instant-navigation#opting-out) on the page or layout to let it keep blocking on the server, then adopt the patterns below one route at a time. For the full migration workflow, see [Migrating to Cache Components](/docs/app/guides/migrating-to-cache-components#following-validation).

## Step 1: Read the current user

Reading the current user reads the session cookie, then looks the user up. A request read can't be part of the static shell, so it always sits behind a [`<Suspense>`](/docs/app/api-reference/file-conventions/loading) boundary and streams in on every navigation.

Because a user session is valid for a period of time, adding a cache lifetime lets the framework prefetch that content ahead of time.

The server-side directives can't give it that lifetime, though: neither a plain [`use cache`](/docs/app/api-reference/directives/use-cache) nor [`use cache: remote`](/docs/app/api-reference/directives/use-cache-remote) can call `cookies()`, and you can't [extract the value and pass it in](/docs/app/getting-started/caching#passing-runtime-values-to-cached-functions) either, because:

- A session helper reads the cookie deep inside its own code, so there's nothing to lift out.
- Validating it compares a token's expiry against the current time (iron-session's `unsealData` rejects an expired seal), so the read is request- and time-dependent.

That's what [`use cache: private`](/docs/app/api-reference/directives/use-cache-private) is for: it reads `cookies()` and `headers()` directly, keeping the result in the browser only, never on the server.

A private scope stays in the browser, so it never caches on the server. To cache on the server instead, extract a value (the `userId`, for example) and pass it into a plain [`use cache`](/docs/app/api-reference/directives/use-cache) or [`use cache: remote`](/docs/app/api-reference/directives/use-cache-remote). The same pattern caches data derived from the session, covered in [Step 4](#step-4-cache-session-derived-data).

```tsx filename="lib/session.ts"
import 'server-only'
import { cookies } from 'next/headers'
import { sealData, unsealData } from 'iron-session'

export type SessionData = {
  userId?: string
}

const COOKIE_NAME = 'app_session'
const password = process.env.SESSION_PASSWORD!

export async function getSession(): Promise<SessionData> {
  const cookie = (await cookies()).get(COOKIE_NAME)?.value
  if (!cookie) {
    return {}
  }
  return unsealData<SessionData>(cookie, { password })
}
```

```tsx filename="lib/auth.ts"
import 'server-only'
import { redirect } from 'next/navigation'
import { getSession } from './session'
import { findUserById } from './data'

export type User = {
  id: string
  name: string
}

export async function getCurrentUser(): Promise<User> {
  'use cache: private'

  const { userId } = await getSession()
  if (!userId) {
    redirect('/login')
  }

  const user = await findUserById(userId)
  if (!user) {
    redirect('/login')
  }

  return { id: user.id, name: user.name }
}
```

The `redirect()` calls throw to interrupt rendering rather than return a value, so they aren't cached. Only a resolved user is.

> **Good to know:** `use cache: private` accepts `cookies()`, `headers()`, and `searchParams`, but not [`connection()`](/docs/app/api-reference/functions/connection). See [`use cache: private`](/docs/app/api-reference/directives/use-cache-private) for the full list.

## Step 2: Show the user without blocking the page

A component that reads the session must sit behind a [`<Suspense>`](/docs/app/api-reference/file-conventions/loading) boundary. With Cache Components, reading `cookies()` outside a boundary is a build error. The boundary is also what keeps the rest of the page fast. Anything outside it prerenders into the [static shell](/docs/app/getting-started/caching#prerendering) and loads instantly, as long as it's static or wrapped in [`use cache`](/docs/app/api-reference/directives/use-cache) and doesn't read runtime data of its own. Only the section behind the boundary waits for the request.

```tsx filename="app/page.tsx"
import { Suspense } from 'react'
import { getCurrentUser } from '@/lib/auth'
import { getAnnouncements } from '@/lib/data'

export default function Page() {
  return (
    <main>
      {/* Cached, so it prerenders into the static shell */}
      <Announcements />

      {/* Reads the session, so it streams in behind the boundary */}
      <Suspense fallback={<p>Loading your dashboard…</p>}>
        <Dashboard />
      </Suspense>
    </main>
  )
}

async function Announcements() {
  'use cache'
  const announcements = await getAnnouncements()
  return (
    <ul>
      {announcements.map((announcement) => (
        <li key={announcement}>{announcement}</li>
      ))}
    </ul>
  )
}

async function Dashboard() {
  const user = await getCurrentUser()
  return <h1>Welcome, {user.name}</h1>
}
```

Keep the session read out of a layout's top level, too. A top-level `await` on the session in a layout holds the whole segment, including `{children}`, behind that request, so push it into a component inside a boundary. See [Push dynamic access down](/docs/app/guides/streaming#push-dynamic-access-down).

> **Good to know:** `getCurrentUser` reads the session, checks it, and returns a narrow user. Centralizing those reads in one function is the [Data Access Layer](/docs/app/guides/authentication#creating-a-data-access-layer-dal) pattern.

## Step 3: Share the user across components

You don't have to read the session again in every component that needs the user. Read it once, then hand it to as many Server and Client Components as you like from inside the same boundary.

Server Components can call `getCurrentUser()` directly. To reach Client Components without prop drilling, create the promise once, pass it through context, and unwrap it with [`use()`](https://react.dev/reference/react/use). For the general pattern, see [Using React's `use` within a Context Provider](/docs/app/guides/single-page-applications#using-reacts-use-within-a-context-provider). Because `getCurrentUser` reads the request, create its promise inside the Suspense boundary, not at the top of a layout.

```tsx filename="app/user-provider.tsx"
'use client'

import { createContext, use } from 'react'
import type { ReactNode } from 'react'
import type { User } from '@/lib/auth'

const UserContext = createContext<Promise<User> | null>(null)

export function UserProvider({
  userPromise,
  children,
}: {
  userPromise: Promise<User>
  children: ReactNode
}) {
  return <UserContext value={userPromise}>{children}</UserContext>
}

export function useUser() {
  const userPromise = use(UserContext)
  if (!userPromise) {
    throw new Error('useUser must be used within a UserProvider')
  }
  return use(userPromise)
}
```

The Server Component behind the boundary creates the promise and hands it to the provider without awaiting it. Each consumer then resolves it behind its own boundary, so the shared chrome renders without waiting on the session:

```tsx filename="app/page.tsx"
function Dashboard() {
  const userPromise = getCurrentUser()

  return (
    <UserProvider userPromise={userPromise}>
      <Suspense fallback={<span>Loading…</span>}>
        <UserBadge />
      </Suspense>
    </UserProvider>
  )
}
```

Client Components call `useUser()` to get the current user. Because `use()` suspends until the promise resolves, keep the component behind a `<Suspense>` boundary:

```tsx filename="app/user-badge.tsx"
'use client'

import { useUser } from './user-provider'

export function UserBadge() {
  const user = useUser()
  return <span>Signed in as {user.name}</span>
}
```

> **Good to know:** Expose only what the client needs. The `getCurrentUser` helper returns a narrow `{ id, name }` rather than the raw session. To keep sensitive fields from reaching the client, see [`taintUniqueValue`](https://react.dev/reference/react/experimental_taintUniqueValue).

## Step 4: Cache session-derived data

Now that you have the user, you can cache the data you fetch for them in one of two ways. Passing the user id into a plain [`use cache`](/docs/app/api-reference/directives/use-cache) function keeps the result on the server, keyed by the id (it becomes part of the [cache key](/docs/app/api-reference/directives/use-cache#cache-keys)), where a [`cacheTag`](/docs/app/api-reference/functions/cacheTag) can invalidate it later. Reading it inside a [`use cache: private`](/docs/app/api-reference/directives/use-cache-private) scope keeps it in the browser only, never on the server, which matters when requirements forbid storing certain data server-side, even ephemerally. The example passes the id, since these notes are tagged and refreshed when they change.

A plain `use cache` scope can't read `cookies()`, so the exported function resolves the user and passes just the id to the cached function:

```tsx filename="lib/data.ts"
import 'server-only'
import { cacheLife, cacheTag } from 'next/cache'
import { getCurrentUser } from './auth'

export async function getNotes() {
  const user = await getCurrentUser()
  return getNotesByUserId(user.id)
}

async function getNotesByUserId(userId: string) {
  'use cache'
  cacheTag(`notes:${userId}`)
  cacheLife('minutes')

  return db.query.notes.findMany({
    where: (notes, { eq }) => eq(notes.userId, userId),
  })
}
```

Keep `getNotesByUserId` unexported so a caller can't request another user's notes by passing a different id. Resolving the user inside the exported getter is what makes that safe. See [Data Security](/docs/app/guides/data-security#data-access-layer).

Call it from a Server Component that renders the notes. There's no user id to pass, and the `getCurrentUser()` call inside the getter hits the private cache, so the session isn't read again:

```tsx filename="app/page.tsx"
async function Notes() {
  const notes = await getNotes()
  // ...
}
```

> **Good to know: cache keys and tags are stored in plain text.** A cached function's arguments and captured variables are serialized into its cache key, and `cacheTag` values are stored as written. Neither is hashed: the default cache holds them as plain-text map keys and tag lists, and a [remote cache](/docs/app/api-reference/directives/use-cache-remote) receives them the same way. Key and tag on a stable identifier like the user id, and keep secrets and sensitive personal data (tokens, passwords, raw emails) out of arguments and tags.

On the server, plain `use cache` keeps the entry in memory as a best effort: it's evicted under pressure and, in serverless, doesn't persist across instances. If that data must survive across instances and requests, opt into [`use cache: remote`](/docs/app/api-reference/directives/use-cache-remote) for durable, shared storage, where [the cache key you choose](/docs/app/api-reference/directives/use-cache-remote#cache-key-considerations) drives your hit rate.

## Step 5: Update session-derived data

When a [Server Action](/docs/app/getting-started/mutating-data) changes a user's data, call [`updateTag`](/docs/app/api-reference/functions/updateTag) with the same tag to refresh the cached entry. Re-read the session inside the action so it authorizes itself rather than trusting the client. See [authentication with Server Actions](/docs/app/guides/authentication#server-actions) for why this matters.

```ts filename="app/actions.ts"
'use server'
import { redirect } from 'next/navigation'
import { updateTag } from 'next/cache'
import { getSession } from '@/lib/session'
import { saveNote } from '@/lib/data'

export async function addNote(formData: FormData) {
  const { userId } = await getSession()
  if (!userId) {
    redirect('/login')
  }

  const note = String(formData.get('note') ?? '').trim()
  if (note) {
    await saveNote(userId, note)
    updateTag(`notes:${userId}`)
  }
}
```

## Step 6: Make authenticated navigations instant

Cached reads already have a lifetime, so this mostly happens on its own. A `use cache: private` scope uses the [`default` profile](/docs/app/api-reference/functions/cacheLife#preset-cache-profiles) (a five-minute `stale`) unless you set one, and a route that reads the session produces a per-session [App Shell](/docs/app/glossary#app-shell) with the authenticated content, prefetched and cached per session. Navigations to it are already instant.

Two things keep it that way:

- If you tune the lifetime with [`cacheLife`](/docs/app/api-reference/functions/cacheLife), keep `stale` at 30 seconds or more. Below that, the scope drops out of prefetching. See [`cacheLife` client cache behavior](/docs/app/api-reference/functions/cacheLife#client-cache-behavior).
- A route that _also_ depends on the URL (a `params` or `searchParams` value) needs [`<Link prefetch={true}>`](/docs/app/api-reference/components/link#prefetch) on the links pointing at it. That opts into [per-link prefetching](/docs/app/guides/optimizing-prefetching), which resolves the per-link data ahead of the click.

```tsx filename="app/page.tsx"
<Link href={`/notes/${note.id}`} prefetch={true}>
  {note.text}
</Link>
```

The destination needs [Partial Prefetching](/docs/app/guides/adopting-partial-prefetching) for this, so enable the [`partialPrefetching`](/docs/app/api-reference/config/next-config-js/partialPrefetching) flag or set `prefetch = 'partial'` on the segment. Add the prop where the wait is worth it: that prefetch costs one server invocation per link, so a sidebar of `/chat/[id]` links pays that cost per item.

## Common pitfalls

- **Reading `cookies()` or `headers()` inside a plain `use cache` function.** This throws. Read the request outside and pass the value in, or use `use cache: private`.
- **Putting secrets or personal data in cache keys or tags.** Arguments and `cacheTag` values are stored in plain text. Key and tag on a stable identifier, not on sensitive input.
- **Trusting the client for authorization.** UI checks hide elements, but they don't protect data. Re-verify the session in every Server Action and [Route Handler](/docs/app/api-reference/file-conventions/route), close to the data. See [Authorization](/docs/app/guides/authentication#authorization).
