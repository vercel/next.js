---
title: unauthorized
description: API Reference for the unauthorized function.
version: experimental
related:
  links:
    - app/api-reference/file-conventions/unauthorized
    - app/api-reference/functions/not-found
    - app/api-reference/functions/forbidden
    - app/api-reference/config/next-config-js/authInterrupts
---

The `unauthorized` function throws an error that renders a Next.js 401 page. It's useful for handling authentication errors, when a request is not signed in. You can customize the UI using the [`unauthorized.js` file](/docs/app/api-reference/file-conventions/unauthorized).

Invoking `unauthorized()` throws a `NEXT_HTTP_ERROR_FALLBACK;401` error and terminates rendering of the route segment where it was thrown. Next.js also injects a `<meta name="robots" content="noindex" />` tag so the page is not indexed. Because it works by throwing, call it in the render path: a component, or a function a component `await`s. A call left in an un-awaited promise throws where nothing catches it, and no unauthorized UI renders.

To start using `unauthorized`, enable the experimental [`authInterrupts`](/docs/app/api-reference/config/next-config-js/authInterrupts) configuration option in your `next.config.js` file:

```ts filename="next.config.ts" switcher
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    authInterrupts: true,
  },
}

export default nextConfig
```

```js filename="next.config.js" switcher
module.exports = {
  experimental: {
    authInterrupts: true,
  },
}
```

`unauthorized` can be invoked in [Server Components](/docs/app/getting-started/server-and-client-components), [Server Functions](/docs/app/getting-started/mutating-data), and [Route Handlers](/docs/app/api-reference/file-conventions/route).

```tsx filename="app/dashboard/page.tsx" switcher
import { verifySession } from '@/app/lib/dal'
import { unauthorized } from 'next/navigation'

export default async function DashboardPage() {
  const session = await verifySession()

  if (!session) {
    unauthorized()
  }

  // Render the dashboard for authenticated users
  return (
    <main>
      <h1>Welcome to the Dashboard</h1>
      <p>Hi, {session.user.name}.</p>
    </main>
  )
}
```

```jsx filename="app/dashboard/page.js" switcher
import { verifySession } from '@/app/lib/dal'
import { unauthorized } from 'next/navigation'

export default async function DashboardPage() {
  const session = await verifySession()

  if (!session) {
    unauthorized()
  }

  // Render the dashboard for authenticated users
  return (
    <main>
      <h1>Welcome to the Dashboard</h1>
      <p>Hi, {session.user.name}.</p>
    </main>
  )
}
```

## Good to know

- The `unauthorized` function cannot be called in the [root layout](/docs/app/api-reference/file-conventions/layout#root-layout).
- You do not need to write `return unauthorized()`. It throws (its TypeScript [`never`](https://www.typescriptlang.org/docs/handbook/2/functions.html#never) return type), so execution stops. A `try/catch` around the call suppresses the interrupt and no unauthorized UI renders. Use [`unstable_rethrow`](/docs/app/api-reference/functions/unstable_rethrow) to let it through.
- An `unauthorized()` left in an un-awaited promise throws where nothing catches it, so no unauthorized UI renders. In development the server logs `⨯ unhandledRejection: NEXT_HTTP_ERROR_FALLBACK;401`. Always `await` the function that may call it.

## Examples

### Calling `unauthorized()` after streaming has started

To keep the page's shell and loading UI visible while the session is verified, put the auth check in the [Data Access Layer](/docs/app/guides/authentication#creating-a-data-access-layer-dal) function that loads the data, and render it in a component wrapped in [`<Suspense>`](https://react.dev/reference/react/Suspense). The check runs inside the boundary, so the shell streams while the session resolves:

```tsx filename="app/account/page.tsx" switcher highlight={8}
import { Suspense } from 'react'
import { verifySession } from '@/app/lib/dal'
import { unauthorized } from 'next/navigation'

async function getAccount() {
  const session = await verifySession()
  if (!session) {
    unauthorized()
  }
  return db.accounts.findByUserId(session.userId)
}

async function AccountDetails() {
  const account = await getAccount()
  return <p>Signed in as {account.email}</p>
}

export default function AccountPage() {
  return (
    <main>
      <h1>Account</h1>
      <Suspense fallback={<p>Loading...</p>}>
        <AccountDetails />
      </Suspense>
    </main>
  )
}
```

```jsx filename="app/account/page.js" switcher highlight={8}
import { Suspense } from 'react'
import { verifySession } from '@/app/lib/dal'
import { unauthorized } from 'next/navigation'

async function getAccount() {
  const session = await verifySession()
  if (!session) {
    unauthorized()
  }
  return db.accounts.findByUserId(session.userId)
}

async function AccountDetails() {
  const account = await getAccount()
  return <p>Signed in as {account.email}</p>
}

export default function AccountPage() {
  return (
    <main>
      <h1>Account</h1>
      <Suspense fallback={<p>Loading...</p>}>
        <AccountDetails />
      </Suspense>
    </main>
  )
}
```

When the request isn't signed in, `getAccount` calls `unauthorized()`, which throws. Because this happens during rendering, the exception propagates to the nearest [`unauthorized`](/docs/app/api-reference/file-conventions/unauthorized) boundary, which renders in place of the streamed-in content, even though the page shell has already been sent.

Add an `unauthorized.tsx` alongside the route to define that UI:

```tsx filename="app/account/unauthorized.tsx" switcher
import Link from 'next/link'

export default function Unauthorized() {
  return (
    <main>
      <h1>401 - Unauthorized</h1>
      <p>
        Please <Link href="/login">sign in</Link> to view your account.
      </p>
    </main>
  )
}
```

```jsx filename="app/account/unauthorized.js" switcher
import Link from 'next/link'

export default function Unauthorized() {
  return (
    <main>
      <h1>401 - Unauthorized</h1>
      <p>
        Please <Link href="/login">sign in</Link> to view your account.
      </p>
    </main>
  )
}
```

The trade-off is the HTTP status code. Because the check runs inside the `<Suspense>` boundary, the response has already begun streaming as a `200`, and the status can't change once streaming has started. This is usually fine for a page, where the user sees the `unauthorized` UI regardless. To return a real `401` status, the check has to run before the response streams. With [Cache Components](/docs/app/getting-started/caching), every dynamic route streams a static shell first, so run that check in [`proxy`](/docs/app/api-reference/file-conventions/proxy) instead. See [Status codes](/docs/app/api-reference/file-conventions/loading#status-codes).

### Displaying login UI to unauthenticated users

You can use `unauthorized` function to display the `unauthorized.js` file with a login UI.

```tsx filename="app/dashboard/page.tsx" switcher
import { verifySession } from '@/app/lib/dal'
import { unauthorized } from 'next/navigation'

export default async function DashboardPage() {
  const session = await verifySession()

  if (!session) {
    unauthorized()
  }

  return <div>Dashboard</div>
}
```

```jsx filename="app/dashboard/page.js" switcher
import { verifySession } from '@/app/lib/dal'
import { unauthorized } from 'next/navigation'

export default async function DashboardPage() {
  const session = await verifySession()

  if (!session) {
    unauthorized()
  }

  return <div>Dashboard</div>
}
```

```tsx filename="app/unauthorized.tsx" switcher
import Login from '@/app/components/Login'

export default function UnauthorizedPage() {
  return (
    <main>
      <h1>401 - Unauthorized</h1>
      <p>Please log in to access this page.</p>
      <Login />
    </main>
  )
}
```

```jsx filename="app/unauthorized.js" switcher
import Login from '@/app/components/Login'

export default function UnauthorizedPage() {
  return (
    <main>
      <h1>401 - Unauthorized</h1>
      <p>Please log in to access this page.</p>
      <Login />
    </main>
  )
}
```

### Mutations with Server Actions

You can invoke `unauthorized` in Server Actions to ensure only authenticated users can perform specific mutations.

```ts filename="app/actions/update-profile.ts" switcher
'use server'

import { verifySession } from '@/app/lib/dal'
import { unauthorized } from 'next/navigation'
import db from '@/app/lib/db'

export async function updateProfile(data: FormData) {
  const session = await verifySession()

  // If the user is not authenticated, return a 401
  if (!session) {
    unauthorized()
  }

  // Proceed with mutation
  // ...
}
```

```js filename="app/actions/update-profile.js" switcher
'use server'

import { verifySession } from '@/app/lib/dal'
import { unauthorized } from 'next/navigation'
import db from '@/app/lib/db'

export async function updateProfile(data) {
  const session = await verifySession()

  // If the user is not authenticated, return a 401
  if (!session) {
    unauthorized()
  }

  // Proceed with mutation
  // ...
}
```

### Fetching data with Route Handlers

You can use `unauthorized` in Route Handlers to ensure only authenticated users can access the endpoint.

```tsx filename="app/api/profile/route.ts" switcher
import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/app/lib/dal'
import { unauthorized } from 'next/navigation'

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Verify the user's session
  const session = await verifySession()

  // If no session exists, return a 401 and render unauthorized.tsx
  if (!session) {
    unauthorized()
  }

  // Fetch data
  // ...
}
```

```jsx filename="app/api/profile/route.js" switcher
import { verifySession } from '@/app/lib/dal'
import { unauthorized } from 'next/navigation'

export async function GET() {
  const session = await verifySession()

  // If the user is not authenticated, return a 401 and render unauthorized.tsx
  if (!session) {
    unauthorized()
  }

  // Fetch data
  // ...
}
```

## Version History

| Version   | Changes                    |
| --------- | -------------------------- |
| `v15.1.0` | `unauthorized` introduced. |
