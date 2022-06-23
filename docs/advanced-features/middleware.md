---
description: Learn how to use Middleware to run code before a request is completed.
---

# Middleware

<details open>
<summary><b>Version History</b></summary>

| Version | Changes |

| --------- | ------------------------------------------------------------------------------------------ |

| `v12.2.0` | Middleware GA |

| `v12.0.9` | Enforce absolute URLs in Edge Runtime ([PR](https://github.com/vercel/next.js/pull/33410)) |

| `v12.0.0` | Middleware (Beta) added |

</details>

Middleware allows you to run code before a request is completed, then based on the incoming request, you can modify the response by rewriting, redirecting, adding headers, or setting cookies.

When a request is made, it will first hit the Middleware, _then_ the cache, meaning you can personalize static content and implement authentication, run A/B tests, deliver personalized pages based on geolocation, and perform bot protection.

## Summary of Middleware

- You create a single `middleware.ts` or `middleware.js` file at your projects root, with an exported function
- The function can be a named, or default export. If the function is a named export, then is **must** be called `middleware`. For a default export, you are free to name it anything you like
  ```js
  //named export
  export function middleware() {}
  // default export
  export default function custom() {}
  ```
- The function can be `async` if you are running asynchronous code
- Middleware executes on _all_ requests, including `/_next`
- Node.js APIs are [**not supported in this environment**](https://edge-runtime.vercel.sh/#developing-edge-functions-locally)

### Permitted response types

When using Middleware, you cannot change the response body: you can only set response headers.
Returning a body from Middleware will result in a `500` server error and an explicit response message.

The [`NextResponse`](#nextresponse) API allows you to:

- `redirect` the incoming request to a different URL
- `rewrite` the response by displaying a given URL
- Set response cookies
- Set response headers

With Middleware you can implement A/B testing, authentication, feature flags, bot protection, and more. See our [examples repository](https://github.com/vercel/examples/tree/main/edge-functions) for code examples.

### Deploying Middleware

Middleware uses a the [Edge Runtime](https://edge-runtime.vercel.sh/features) and supports standard Web APIs like `fetch`. Middleware works out of the box using `next start`, as well as on Edge platforms like Vercel, which use [Edge Functions](https://vercel.com/docs/concepts/functions/vercel-edge-functions).

## Using Middleware

To begin using Middleware, follow the steps below:

1. Install the latest version of Next.js:

```bash
npm install next@latest
```

2. Create a `middleware.ts` file under your project root directory. Note that the file extension can be either `.ts` _or_ `.js`

3. Export a middleware function from the `middleware.ts` file. The following example assumes you have a route called `/about` in your project, and that you want to rewrite to a new route `/about-2` whenever someone visits `/about`:

```typescript
// middleware.ts

import { NextResponse } from 'next/server’
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  return NextResponse.redirect(new URL('/about-2', request.url));
}

// config with custom matcher
export const config = {
  matcher: '/about/:path*'
}
```

Middleware will be invoked for **every route in your project**. There are two ways to define which paths the middleware should be run on: with a custom matcher config or with conditional statements.

### Match paths based on custom matcher config

To decide which route the Middleware should be run on, you can use a custom matcher config to filter on specific paths. The matcher property can be used to define either a single path, or using an array syntax, multiple paths.

#### Match a single path

```js
export const config = {
  matcher: '/about/:path*',
}
```

#### Match multiple paths

```js
export const config = {
  matcher: ['/about/:path*', '/dashboard/:path*'],
}
```

Note that while the config option is the preferred method, **as it does not get invoked on every request**, you can also use conditional statements to only run the Middleware when it matches specific paths.

### Match paths based on conditional statements

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

### Using cookies in Middleware

The cookies API extends [Map](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map), and follows a get/set model, allowing you to get, set, and delete cookies within your middleware function. It includes methods like [entries](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/entries) and [values](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/entries).

```typescript
// middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  // Accessing cookies on the response object
  const response = NextResponse.next()
  // set a cookie
  response.cookies.set('vercel', 'fast')
  // set another cookie with options
  response.cookies.set('nextjs', 'awesome', { path: '/test' })
  // get all the details of a cookie
  const { value, options } = response.cookies.getWithOptions('vercel')
  console.log(value) // => 'fast'
  console.log(options) // => { Path: '/test' }
  // deleting a cookie will mark it as expired
  response.cookies.delete('vercel')
  // clear all cookies means mark all of them as expired
  response.cookies.clear()

  // Accessing cookies on the request object
  // get a cookie
  const cookie = request.cookies.get('vercel')
  console.log(cookie) // => 'fast'
  // get all cookies
  const allCookies = request.cookies.entries()
  console.log(allCookies) // => [{ key: 'vercel', value: 'fast' }]
  // delete a cookie
  request.cookies.delete('vercel')
  // clear all cookies
  request.cookies.clear()

  return response
}
```

### How to check if Middleware is invoked for pages

To check if Middleware is being invoked for certain pages or assets, you can use the web standard, [`URLPattern`](https://developer.mozilla.org/en-US/docs/Web/API/URLPattern) API. The following example shows how you can accomplish routing pattern matching using the URLPattern API.

```typescript
// middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Assignment of a URL pattern
const PATTERNS = [
  [
    // Define a pattern based on the presence of pathname
    new URLPattern({ pathname: '/:locale/:slug' }),
    // The handler associated with the pattern returns the detected groups
    ({ pathname }) => pathname.groups,
  ],
]

// The params function tries to match the incoming URL against the list of patterns. It exists early if it finds the first matching result
const params = (url) => {
  // Remove the query parameters from the incoming URL
  const input = url.split('?')[0]
  let result = {}

  // Iterating over the previously declared list of patterns
  for (const [pattern, handler] of PATTERNS) {
    // `patternResult` will contain info about the successful match
    const patternResult = pattern.exec(input)

    // If the pathname matches, then resolve using the handler associated with the pattern
    if (patternResult !== null && 'pathname' in patternResult) {
      result = handler(patternResult)
      break
    }
  }
  return result
}

// Middleware for rewriting URLs into locale subdomain URLs
// Turns `https://{domain}/{locale}/{slug}` into `https://{locale}.{domain}/{slug}`
export function middleware(request: NextRequest) {
  const { locale, slug } = params(request.url)
  if (locale && slug) {
    const { search, protocol, host } = request.nextUrl
    const url = new URL(`${protocol}//${locale}.${host}/${slug}${search}`)
    return NextResponse.redirect(url)
  }
}
```

## Middleware API

Next.js Middleware uses the [Edge Runtime API](https://edge-runtime.vercel.sh/features/available-apis), which includes the following APIs:

- [Network APIs](https://edge-runtime.vercel.sh/features/available-apis#network-apis)
- [Encoding APIs](https://edge-runtime.vercel.sh/features/available-apis#encoding-apis)
- [Web Stream APIs](https://edge-runtime.vercel.sh/features/available-apis#web-stream-apis)
- [Web Crypto APIs](https://edge-runtime.vercel.sh/features/available-apis#web-crypto-apis)
- [Web Standard APIs](https://edge-runtime.vercel.sh/features/available-apis#web-standards-apis)
- [V8 Primitives](https://edge-runtime.vercel.sh/features/available-apis#v8-primitives)

See the [Edge Runtime documentation](https://edge-runtime.vercel.sh/) for a full list of the available APIs.

In addition to these APIs, Next.js Middleware comes with built in helpers that are based upon the native [`FetchEvent`](https://developer.mozilla.org/en-US/docs/Web/API/FetchEvent), [`Response`](https://developer.mozilla.org/en-US/docs/Web/API/Response), and [`Request`](https://developer.mozilla.org/en-US/docs/Web/API/Request) objects.

See the [`next/server`](/docs/api-reference/next/server.md) documentation for more information.

## Related

<div class="card">
  <a href="https://edge-runtime.vercel.sh/">
    <b>Edge Runtime</b>
    <small>Learn more about the supported APIs for Next.js Middleware.</small>
  </a>
</div>
