---
description: Learn how to use Edge Middleware to run code before a request is completed.
---

# Edge Middleware

<details open>

<summary><b>Version History</b></summary>

| Version | Changes |

| --------- | ------------------------------------------------------------------------------------------ |

| `v12.2.0` | Edge Middleware GA. |

| `v12.0.9` | Enforce absolute URLs in Edge Runtime ([PR](https://github.com/vercel/next.js/pull/33410)) |

| `v12.0.0` | Middleware (Beta) added. |

</details>

Edge Middleware enables you to use code over configuration. This gives you full flexibility in Next.js, because you can run code _before_ a request is completed. Edge Middleware runs _before_ the CDN cache lookup, then based on the incoming request, you can modify the response by rewriting, redirecting, adding headers, or setting cookies.

## Summary of Edge Middleware

- A single `middleware.ts` file is created at your projects root, with an exported function (the file extension can be either `.ts` or `.js`)
- The function can be a named, or default export. If the function is a named export, then is **must** be called `middleware`. For a default export, you are free to name it anything you like
- The function can be `async` if you are running asynchronous code
- Edge Middleware executes on _all_ requests, including `/_next`
- Node.js APIs are [**not supported in this environment**](https://edge-runtime.vercel.sh/#developing-edge-functions-locally)

### Permitted response types

When using Edge Middleware, it is not permitted to change the response body: you can only set response headers.
Returning a body from an Edge Middleware function will result in a `500` server error and an explicit response message.

The [`NextResponse`](#nextresponse) API allows you to:

- `redirect` the incoming request to a different URL
- `rewrite` the response by displaying a given URL
- Set response cookies
- Set response headers

These tools enable you to implement A/B testing, authentication, feature flags, bot protection, and more. See our [examples repository](https://github.com/vercel/examples/tree/main/edge-functions) for code examples.

### Deploying Edge Middleware

Next.js Middleware uses a the [Edge Runtime](https://edge-runtime.vercel.sh/features) and supports standard Web APIs like `fetch`. This works out of the box using `next start`, as well as on Edge platforms like Vercel, which use [Edge Functions](https://vercel.com/docs/concepts/functions/edge-functions).

## Using Edge Middleware

To begin using Edge Middleware, follow the steps below:

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

Edge Middleware will be invoked for **every route in your project**. There are two ways to define which paths the middleware should be run on, with a custom matcher config, or with conditional statements.

### Match paths based on custom matcher config

To decide which route the Edge Middleware should be run on, you can use a custom matcher config to filter on specific paths. The matcher property can be used to define either a single path, or using an array syntax, multiple paths.

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

Note that while the config option is the preferred method, **as it does not get invoked on every request**, you can also use conditional statements to only run the Edge Middleware when it matches specific paths.

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

### Using cookies in Edge Middleware

The cookies API extends [Map](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map), and follows a get/set model, allowing you to get, set, and delete cookies within your middleware function. It includes methods like [entries](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/entries) and [values](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/entries).

```typescript
// middleware.ts
import { NextResponse } from 'next/server'

export function middleware() {
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

  return response
}
```

### How to check if Edge Middleware is invoked for pages

To check if Edge Middleware is being invoked for certain pages or assets, you can use the web standard, [`URLPattern`](https://developer.mozilla.org/en-US/docs/Web/API/URLPattern) API. The following example shows how you can accomplish routing pattern matching using the URLPattern API.

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

## Edge Middleware API

Next.js Middleware uses the [Edge Runtime API](https://edge-runtime.vercel.sh/features/available-apis), which includes the following APIs:

- [Network APIs](https://edge-runtime.vercel.sh/features/available-apis#network-apis)
- [Encoding APIs](https://edge-runtime.vercel.sh/features/available-apis#encoding-apis)
- [Web Stream APIs](https://edge-runtime.vercel.sh/features/available-apis#web-stream-apis)
- [Web Crypto APIs](https://edge-runtime.vercel.sh/features/available-apis#web-crypto-apis)
- [Web Standard APIs](https://edge-runtime.vercel.sh/features/available-apis#web-standards-apis)
- [V8 Primitives](https://edge-runtime.vercel.sh/features/available-apis#v8-primitives)

See the [Edge Runtime documentation](https://edge-runtime.vercel.sh/) for a full list of the available APIs.

In addition to these APIs, Next.js Middleware comes with built in helpers that are based upon the native [`FetchEvent`](https://developer.mozilla.org/en-US/docs/Web/API/FetchEvent), [`Response`](https://developer.mozilla.org/en-US/docs/Web/API/Response), and [`Request`](https://developer.mozilla.org/en-US/docs/Web/API/Request) objects.

### NextRequest

The `NextRequest` object is an extension of the native [`Request`](https://developer.mozilla.org/en-US/docs/Web/API/Request) interface, with the following added methods and properties:

- `cookies` - A [Map](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map) with cookies from the `Request`.
- `nextUrl` - Includes an extended, parsed, URL object that gives you access to Next.js specific properties such as `pathname`, `basePath`, `trailingSlash` and `i18n`. Includes the following properties:
  - `basePath`
  - `buildId`
  - `defaultLocale`
  - `domainLocale`
  - `locale`
  - `url`
- `ip` - Has the IP address of the `Request`
- `ua` - Has the user agent. Includes the following properties:
  - `isBot`
  - `browser`
    - `name`
    - `version`
  - `device`
    - `model`
    - `type`
    - `vendor`
  - `engine`
    - `name`
    - `version`
  - `os`
    - `name`
    - `version`
  - `cpu`
    - `architecture`
- `geo` - Has the geographic location from the `Request`. This information is provided by your hosting platform. Includes the following properties:
  - `city`
  - `country`
  - `region`
  - `latitude`
  - `longitude`

You can use the `NextRequest` object as a direct replacement for the native `Request` interface, giving you more control over how you manipulate the request.

`NextRequest` can be imported from `next/server` as a type:

```ts
import type { NextRequest } from 'next/server'
```

### NextFetchEvent

The `NextFetchEvent` object extends the native [`FetchEvent`](https://developer.mozilla.org/en-US/docs/Web/API/FetchEvent) object, and includes the [`waitUntil()`](https://developer.mozilla.org/en-US/docs/Web/API/ExtendableEvent/waitUntil) method.

The `waitUntil()` method can be used to prolong the execution of the function if you have other background work to make.

```typescript
// Replace this with a better example
import type { NextRequest, NextFetchEvent } from 'next/server'

export function middleware(request: NextRequest, event: NextFetchEvent) {
  event.waitUntil(
    fetch('https://api.example.com/').then((response) => {
      // Do something with the response
    })
  )

  return NextResponse.next()
}
```

The `event` object can be imported from `next/server`:

```typescript
import type { NextFetchEvent } from 'next/server'
```

### NextResponse

The `NextResponse` class extends the native [`Response`](https://developer.mozilla.org/en-US/docs/Web/API/Response) interface, with the following:

#### Public methods

Public methods are available on an instance of the `NextResponse` class. Depending on your use case, you can create an instance and assign to a variable, then access the following public methods:

- `cookies` - A [Map](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map) with the cookies in the `Response`

#### Static methods

The following static methods are available on the `NextResponse` class directly:

- `redirect()` - Returns a `NextResponse` with a redirect set
- `rewrite()` - Returns a `NextResponse` with a rewrite set
- `next()` - Returns a `NextResponse` that will continue the middleware chain

```typescript
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  // if the request is coming from New York, redirect to the home page
  if (request.geo.city === 'New York') {
    return NextResponse.redirect('/home')
    // if the request is coming from London, rewrite to a special page
  } else if (request.geo.city === 'London') {
    return NextResponse.rewrite('/not-home')
  }
  return NextResponse.next()
}
```

All methods above return a `NextResponse` object that only takes effect if it's returned in the middleware function.

`NextResponse` can be imported from `next/server`:

```typescript
import { NextResponse } from 'next/server'
```

## Common questions and answers

### Why does `redirect` use 307 and 308?

When using `redirect()` you may notice that the status codes used are `307` for a temporary redirect, and `308` for a permanent redirect. While traditionally a `302` was used for a temporary redirect, and a `301` for a permanent redirect, many browsers changed the request method of the redirect, from a `POST` to `GET` request when using a `302`, regardless of the origins request method.

Taking the following example of a redirect from `/users` to `/people`, if you make a `POST` request to `/users` to create a new user, and are conforming to a `302` temporary redirect, the request method will be changed from a `POST` to a `GET` request. This doesn't make sense, as to create a new user, you should be making a `POST` request to `/people`, and not a `GET` request.

The introduction of the `307` status code means that the request method is preserved as `POST`.

- `302` - Temporary redirect, will change the request method from `POST` to `GET`
- `307` - Temporary redirect, will preserve the request method as `POST`

The `redirect()` method uses a `307` by default, instead of a `302` temporary redirect, meaning your requests will _always_ be preserved as `POST` requests.

If you want to cause a `GET` response to a `POST` request, use `303`.

[Learn more](https://developer.mozilla.org/en-US/docs/Web/HTTP/Redirections) about HTTP Redirects.

### How do I access Environment Variables?

`process.env` can be used to access [Environment Variables](/docs/basic-features/environment-variables.md) from Middleware. These are evaluated at build time, so only environment variables _actually_ used will be included.

| Works                               | Does **not** work                          |
| ----------------------------------- | ------------------------------------------ |
| `console.log(process.env.NODE_ENV)` | `process.env["HELLO" + "_WORLD"]`          |
| `const { NODE_ENV } = process.env`  | `const getEnv = name => process.env[name]` |
|                                     | `console.log(process.env)`                 |

## Related

<div class="card">
  <a href="https://edge-runtime.vercel.sh/">
    <b>Edge Runtime</b>
    <small>Learn more about the supported APIs for Next.js Middleware.</small>
  </a>
</div>
