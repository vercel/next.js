---
title: unauthorized
description: API Reference for the unauthorized function.
version: experimental
related:
  links:
    - app/api-reference/file-conventions/unauthorized
---

The `unauthorized` function throws an error that renders a Next.js 401 error page. It's useful for handling authorization errors in your application. You can customize the UI using the [`unauthorized.js` file](/docs/app/api-reference/file-conventions/unauthorized).

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

`unauthorized` can be invoked in [Server Components](/docs/app/getting-started/server-and-client-components), [Server Actions](/docs/app/getting-started/updating-data), and [Route Handlers](/docs/app/api-reference/file-conventions/route).

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

## Examples

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
