---
title: forbidden
description: API Reference for the forbidden function.
version: experimental
related:
  links:
    - app/api-reference/file-conventions/forbidden
    - app/api-reference/functions/not-found
    - app/api-reference/functions/unauthorized
    - app/api-reference/config/next-config-js/authInterrupts
---

The `forbidden` function throws an error that renders a Next.js 403 page. It's useful for handling authorization errors in your application. You can customize the UI using the [`forbidden.js` file](/docs/app/api-reference/file-conventions/forbidden).

Invoking `forbidden()` throws a `NEXT_HTTP_ERROR_FALLBACK;403` error and terminates rendering of the route segment where it was thrown. Next.js also injects a `<meta name="robots" content="noindex" />` tag so the page is not indexed. Because it works by throwing, call it in the render path: a component, or a function a component `await`s. A call left in an un-awaited promise throws where nothing catches it, and no forbidden UI renders.

To start using `forbidden`, enable the experimental [`authInterrupts`](/docs/app/api-reference/config/next-config-js/authInterrupts) configuration option in your `next.config.js` file:

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

`forbidden` can be invoked in [Server Components](/docs/app/getting-started/server-and-client-components), [Server Functions](/docs/app/getting-started/mutating-data), and [Route Handlers](/docs/app/api-reference/file-conventions/route).

```tsx filename="app/admin/page.tsx" switcher
import { verifySession } from '@/app/lib/dal'
import { forbidden } from 'next/navigation'

export default async function AdminPage() {
  const session = await verifySession()

  // Check if the user has the 'admin' role
  if (session.role !== 'admin') {
    forbidden()
  }

  // Render the admin page for authorized users
  return <></>
}
```

```jsx filename="app/admin/page.js" switcher
import { verifySession } from '@/app/lib/dal'
import { forbidden } from 'next/navigation'

export default async function AdminPage() {
  const session = await verifySession()

  // Check if the user has the 'admin' role
  if (session.role !== 'admin') {
    forbidden()
  }

  // Render the admin page for authorized users
  return <></>
}
```

## Good to know

- The `forbidden` function cannot be called in the [root layout](/docs/app/api-reference/file-conventions/layout#root-layout).
- You do not need to write `return forbidden()`. It throws (its TypeScript [`never`](https://www.typescriptlang.org/docs/handbook/2/functions.html#never) return type), so execution stops. A `try/catch` around the call suppresses the interrupt and no forbidden UI renders. Use [`unstable_rethrow`](/docs/app/api-reference/functions/unstable_rethrow) to let it through.
- A `forbidden()` left in an un-awaited promise throws where nothing catches it, so no forbidden UI renders. In development the server logs `⨯ unhandledRejection: NEXT_HTTP_ERROR_FALLBACK;403`. Always `await` the function that may call it.

## Examples

### Calling `forbidden()` after streaming has started

To keep the page's shell and loading UI visible while the session is checked, put the role check in the [Data Access Layer](/docs/app/guides/authentication#creating-a-data-access-layer-dal) function that loads the data, and render it in a component wrapped in [`<Suspense>`](https://react.dev/reference/react/Suspense). The check runs inside the boundary, so the shell streams while the session resolves:

```tsx filename="app/projects/page.tsx" switcher highlight={8}
import { Suspense } from 'react'
import { verifySession } from '@/app/lib/dal'
import { forbidden } from 'next/navigation'

async function getProjects() {
  const session = await verifySession()
  if (session?.role !== 'admin') {
    forbidden()
  }
  return db.projects.findMany()
}

async function Projects() {
  const projects = await getProjects()
  return (
    <ul>
      {projects.map((project) => (
        <li key={project.id}>{project.name}</li>
      ))}
    </ul>
  )
}

export default function ProjectsPage() {
  return (
    <main>
      <h1>Projects</h1>
      <Suspense fallback={<p>Loading...</p>}>
        <Projects />
      </Suspense>
    </main>
  )
}
```

```jsx filename="app/projects/page.js" switcher highlight={8}
import { Suspense } from 'react'
import { verifySession } from '@/app/lib/dal'
import { forbidden } from 'next/navigation'

async function getProjects() {
  const session = await verifySession()
  if (session?.role !== 'admin') {
    forbidden()
  }
  return db.projects.findMany()
}

async function Projects() {
  const projects = await getProjects()
  return (
    <ul>
      {projects.map((project) => (
        <li key={project.id}>{project.name}</li>
      ))}
    </ul>
  )
}

export default function ProjectsPage() {
  return (
    <main>
      <h1>Projects</h1>
      <Suspense fallback={<p>Loading...</p>}>
        <Projects />
      </Suspense>
    </main>
  )
}
```

When the session lacks access, `getProjects` calls `forbidden()`, which throws. Because this happens during rendering, the exception propagates to the nearest [`forbidden`](/docs/app/api-reference/file-conventions/forbidden) boundary, which renders in place of the streamed-in content, even though the page shell has already been sent.

Add a `forbidden.tsx` alongside the route to define that UI:

```tsx filename="app/projects/forbidden.tsx" switcher
export default function Forbidden() {
  return (
    <main>
      <h1>403 - Forbidden</h1>
      <p>You don't have access to this page.</p>
    </main>
  )
}
```

```jsx filename="app/projects/forbidden.js" switcher
export default function Forbidden() {
  return (
    <main>
      <h1>403 - Forbidden</h1>
      <p>You don't have access to this page.</p>
    </main>
  )
}
```

The trade-off is the HTTP status code. Because the check runs inside the `<Suspense>` boundary, the response has already begun streaming as a `200`, and the status can't change once streaming has started. This is usually fine for a page, where the user sees the `forbidden` UI regardless. To return a real `403` status, the check has to run before the response streams. With [Cache Components](/docs/app/getting-started/caching), every dynamic route streams a static shell first, so run that check in [`proxy`](/docs/app/api-reference/file-conventions/proxy) instead. See [Status codes](/docs/app/api-reference/file-conventions/loading#status-codes).

### Role-based route protection

You can use `forbidden` to restrict access to certain routes based on user roles. This ensures that users who are authenticated but lack the required permissions cannot access the route.

```tsx filename="app/admin/page.tsx" switcher
import { verifySession } from '@/app/lib/dal'
import { forbidden } from 'next/navigation'

export default async function AdminPage() {
  const session = await verifySession()

  // Check if the user has the 'admin' role
  if (session.role !== 'admin') {
    forbidden()
  }

  // Render the admin page for authorized users
  return (
    <main>
      <h1>Admin Dashboard</h1>
      <p>Welcome, {session.user.name}!</p>
    </main>
  )
}
```

```jsx filename="app/admin/page.js" switcher
import { verifySession } from '@/app/lib/dal'
import { forbidden } from 'next/navigation'

export default async function AdminPage() {
  const session = await verifySession()

  // Check if the user has the 'admin' role
  if (session.role !== 'admin') {
    forbidden()
  }

  // Render the admin page for authorized users
  return (
    <main>
      <h1>Admin Dashboard</h1>
      <p>Welcome, {session.user.name}!</p>
    </main>
  )
}
```

### Mutations with Server Actions

When implementing mutations in Server Actions, you can use `forbidden` to only allow users with a specific role to update sensitive data.

```ts filename="app/actions/update-role.ts" switcher
'use server'

import { verifySession } from '@/app/lib/dal'
import { forbidden } from 'next/navigation'
import db from '@/app/lib/db'

export async function updateRole(formData: FormData) {
  const session = await verifySession()

  // Ensure only admins can update roles
  if (session.role !== 'admin') {
    forbidden()
  }

  // Perform the role update for authorized users
  // ...
}
```

```js filename="app/actions/update-role.js" switcher
'use server'

import { verifySession } from '@/app/lib/dal'
import { forbidden } from 'next/navigation'
import db from '@/app/lib/db'

export async function updateRole(formData) {
  const session = await verifySession()

  // Ensure only admins can update roles
  if (session.role !== 'admin') {
    forbidden()
  }

  // Perform the role update for authorized users
  // ...
}
```

## Version History

| Version   | Changes                 |
| --------- | ----------------------- |
| `v15.1.0` | `forbidden` introduced. |
