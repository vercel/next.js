---
title: redirect
description: API Reference for the redirect function.
related:
  links:
    - app/api-reference/functions/permanentRedirect
---

The `redirect` function allows you to redirect the user to another URL. `redirect` can be used while rendering in [Server and Client Components](/docs/app/getting-started/server-and-client-components), [Route Handlers](/docs/app/api-reference/file-conventions/route), and [Server Actions](/docs/app/getting-started/updating-data).

When used in a [streaming context](/docs/app/getting-started/linking-and-navigating#streaming), this will insert a meta tag to emit the redirect on the client side. When used in a server action, it will serve a 303 HTTP redirect response to the caller. Otherwise, it will serve a 307 HTTP redirect response to the caller.

If a resource doesn't exist, you can use the [`notFound` function](/docs/app/api-reference/functions/not-found) instead.

## Reference

### Parameters

The `redirect` function accepts two arguments:

```js
redirect(path, type)
```

| Parameter | Type                                                          | Description                                                 |
| --------- | ------------------------------------------------------------- | ----------------------------------------------------------- |
| `path`    | `string`                                                      | The URL to redirect to. Can be a relative or absolute path. |
| `type`    | `'replace'` (default) or `'push'` (default in Server Actions) | The type of redirect to perform.                            |

By default, `redirect` will use `push` (adding a new entry to the browser history stack) in [Server Actions](/docs/app/getting-started/updating-data) and `replace` (replacing the current URL in the browser history stack) everywhere else. You can override this behavior by specifying the `type` parameter.

The `RedirectType` object contains the available options for the `type` parameter.

```ts
import { redirect, RedirectType } from 'next/navigation'

redirect('/redirect-to', RedirectType.replace)
// or
redirect('/redirect-to', RedirectType.push)
```

The `type` parameter has no effect when used in Server Components.

### Returns

`redirect` does not return a value.

## Behavior

- In Server Actions and Route Handlers, redirect should be called **outside** the `try` block when using `try/catch` statements.
- If you prefer to return a 308 (Permanent) HTTP redirect instead of 307 (Temporary), you can use the [`permanentRedirect` function](/docs/app/api-reference/functions/permanentRedirect) instead.
- `redirect` throws an error so it should be called **outside** the `try` block when using `try/catch` statements.
- `redirect` can be called in Client Components during the rendering process but not in event handlers. You can use the [`useRouter` hook](/docs/app/api-reference/functions/use-router) instead.
- `redirect` also accepts absolute URLs and can be used to redirect to external links.
- If you'd like to redirect before the render process, use [`next.config.js`](/docs/app/guides/redirecting#redirects-in-nextconfigjs) or [Proxy](/docs/app/guides/redirecting#nextresponseredirect-in-proxy).

## Example

### Server Component

Invoking the `redirect()` function throws a `NEXT_REDIRECT` error and terminates rendering of the route segment in which it was thrown.

```tsx filename="app/team/[id]/page.tsx" switcher
import { redirect } from 'next/navigation'

async function fetchTeam(id: string) {
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
  const team = await fetchTeam(id)

  if (!team) {
    redirect('/login')
  }

  // ...
}
```

```jsx filename="app/team/[id]/page.js" switcher
import { redirect } from 'next/navigation'

async function fetchTeam(id) {
  const res = await fetch('https://...')
  if (!res.ok) return undefined
  return res.json()
}

export default async function Profile({ params }) {
  const { id } = await params
  const team = await fetchTeam(id)

  if (!team) {
    redirect('/login')
  }

  // ...
}
```

> **Good to know**: `redirect` does not require you to use `return redirect()` as it uses the TypeScript [`never`](https://www.typescriptlang.org/docs/handbook/2/functions.html#never) type.

### Client Component

`redirect` can be directly used in a Client Component.

```tsx filename="components/client-redirect.tsx" switcher
'use client'

import { redirect, usePathname } from 'next/navigation'

export function ClientRedirect() {
  const pathname = usePathname()

  if (pathname.startsWith('/admin') && !pathname.includes('/login')) {
    redirect('/admin/login')
  }

  return <div>Login Page</div>
}
```

```jsx filename="components/client-redirect.jsx" switcher
'use client'

import { redirect, usePathname } from 'next/navigation'

export function ClientRedirect() {
  const pathname = usePathname()

  if (pathname.startsWith('/admin') && !pathname.includes('/login')) {
    redirect('/admin/login')
  }

  return <div>Login Page</div>
}
```

> **Good to know**: When using `redirect` in a Client Component on initial page load during Server-Side Rendering (SSR), it will perform a server-side redirect.

`redirect` can be used in a Client Component through a Server Action. If you need to use an event handler to redirect the user, you can use the [`useRouter`](/docs/app/api-reference/functions/use-router) hook.

```tsx filename="app/client-redirect.tsx" switcher
'use client'

import { navigate } from './actions'

export function ClientRedirect() {
  return (
    <form action={navigate}>
      <input type="text" name="id" />
      <button>Submit</button>
    </form>
  )
}
```

```jsx filename="app/client-redirect.jsx" switcher
'use client'

import { navigate } from './actions'

export function ClientRedirect() {
  return (
    <form action={navigate}>
      <input type="text" name="id" />
      <button>Submit</button>
    </form>
  )
}
```

```ts filename="app/actions.ts" switcher
'use server'

import { redirect } from 'next/navigation'

export async function navigate(data: FormData) {
  redirect(`/posts/${data.get('id')}`)
}
```

```js filename="app/actions.js" switcher
'use server'

import { redirect } from 'next/navigation'

export async function navigate(data) {
  redirect(`/posts/${data.get('id')}`)
}
```

## FAQ

### Why does `redirect` use 307 and 308?

When using `redirect()` you may notice that the status codes used are `307` for a temporary redirect, and `308` for a permanent redirect. While traditionally a `302` was used for a temporary redirect, and a `301` for a permanent redirect, many browsers changed the request method of the redirect, from a `POST` to `GET` request when using a `302`, regardless of the origins request method.

Taking the following example of a redirect from `/users` to `/people`, if you make a `POST` request to `/users` to create a new user, and are conforming to a `302` temporary redirect, the request method will be changed from a `POST` to a `GET` request. This doesn't make sense, as to create a new user, you should be making a `POST` request to `/people`, and not a `GET` request.

The introduction of the `307` status code means that the request method is preserved as `POST`.

- `302` - Temporary redirect, will change the request method from `POST` to `GET`
- `307` - Temporary redirect, will preserve the request method as `POST`

The `redirect()` method uses a `307` by default, instead of a `302` temporary redirect, meaning your requests will _always_ be preserved as `POST` requests.

[Learn more](https://developer.mozilla.org/docs/Web/HTTP/Redirections) about HTTP Redirects.

## Version History

| Version   | Changes                |
| --------- | ---------------------- |
| `v13.0.0` | `redirect` introduced. |
