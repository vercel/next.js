---
description: Learn how to use Middleware to run code before a request is completed.
---

# Middleware

<details open>
<summary><b>Version History</b></summary>

| Version   | Changes                                                                                    |
| --------- | ------------------------------------------------------------------------------------------ |
| `v12.2.0` | Middleware is stable                                                                       |
| `v12.0.9` | Enforce absolute URLs in Edge Runtime ([PR](https://github.com/vercel/next.js/pull/33410)) |
| `v12.0.0` | Middleware (Beta) added                                                                    |

</details>

Middleware allows you to run code before a request is completed, then based on the incoming request, you can modify the response by rewriting, redirecting, adding headers, or setting cookies.

Middleware runs _before_ cached content, so you can personalize static files and pages. Common examples of Middleware would be authentication, A/B testing, localized pages, bot protection, and more. Regarding localized pages, you can start with [i18n routing](/docs/advanced-features/i18n-routing) and implement Middleware for more advanced use cases.

> **Note:** If you were using Middleware prior to `12.2`, please see the [upgrade guide](https://nextjs.org/docs/messages/middleware-upgrade-guide).

## Using Middleware

To begin using Middleware, follow the steps below:

1. Install the latest version of Next.js:

```bash
npm install next@latest
```

2. Create a `middleware.ts` (or `.js`) file at the same level as your `pages` directory
3. Export a middleware function from the `middleware.ts` file:

```typescript
// middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// This function can be marked `async` if using `await` inside
export function middleware(request: NextRequest) {
  return NextResponse.redirect(new URL('/about-2', request.url))
}

// See "Matching Paths" below to learn more
export const config = {
  matcher: '/about/:path*',
}
```

## Matching Paths

Middleware will be invoked for **every route in your project**. The following is the execution order:

1. `headers` from `next.config.js`
2. `redirects` from `next.config.js`
3. Middleware (`rewrites`, `redirects`, etc.)
4. `beforeFiles` (`rewrites`) from `next.config.js`
5. Filesystem routes (`public/`, `_next/static/`, Pages, etc.)
6. `afterFiles` (`rewrites`) from `next.config.js`
7. Dynamic Routes (`/blog/[slug]`)
8. `fallback` (`rewrites`) from `next.config.js`

There are two ways to define which paths Middleware will run on:

1. Custom matcher config
2. Conditional statements

### Matcher

`matcher` allows you to filter Middleware to run on specific paths.

```js
export const config = {
  matcher: '/about/:path*',
}
```

You can match a single path or multiple paths with an array syntax:

```js
export const config = {
  matcher: ['/about/:path*', '/dashboard/:path*'],
}
```

> **Note:** The `matcher` values need to be constants so they can be statically analyzed at build-time. Dynamic values such as variables will be ignored.

### Conditional Statements

```typescript
// middleware.ts

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/about')) {
    return NextResponse.rewrite(new URL('/about-2', request.url))
  }

  if (request.nextUrl.pathname.startsWith('/dashboard')) {
    return NextResponse.rewrite(new URL('/dashboard/user', request.url))
  }
}
```

## NextResponse

The [`NextResponse`](#nextresponse) API allows you to:

- `redirect` the incoming request to a different URL
- `rewrite` the response by displaying a given URL
- Set response cookies
- Set response headers

To produce a response from Middleware, you should `rewrite` to a route ([Page](/docs/basic-features/pages.md) or [Edge API Route](/docs/api-routes/edge-api-routes.md)) that produces a response.

## Using Cookies

The `cookies` API extends [Map](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map) and allows you to `get`, `set`, and `delete` cookies. It also includes methods like [entries](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/entries) and [values](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/entries).

```typescript
// middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  // Setting cookies on the response
  const response = NextResponse.next()
  response.cookies.set('vercel', 'fast')
  response.cookies.set('vercel', 'fast', { path: '/test' })

  // Getting cookies from the request
  const cookie = request.cookies.get('vercel')
  console.log(cookie) // => 'fast'
  const allCookies = request.cookies.entries()
  console.log(allCookies) // => [{ key: 'vercel', value: 'fast' }]
  const { value, options } = response.cookies.getWithOptions('vercel')
  console.log(value) // => 'fast'
  console.log(options) // => { Path: '/test' }

  // Deleting cookies
  response.cookies.delete('vercel')
  response.cookies.clear()

  return response
}
```

## Related

<div class="card">
  <a href="/docs/api-reference/edge-runtime.md">
    <b>Edge Runtime</b>
    <small>Learn more about the supported Web APIs available.</small>
  </a>
</div>

<div class="card">
  <a href="/docs/api-reference/next/server.md">
    <b>Middleware API Reference</b>
    <small>Learn more about the supported APIs for Middleware.</small>
  </a>
</div>

<div class="card">
  <a href="/docs/api-routes/edge-api-routes.md">
    <b>Edge API Routes</b>
    <small>Build high performance APIs in Next.js. </small>
  </a>
</div>
