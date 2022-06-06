# Middleware Upgrade Guide

As we work on improving Middleware for General Availability (GA), we've made some changes to the Middleware APIs (and how you define Middleware in your application) based on your feedback.

This upgrade guide will help you understand the changes and how to migrate your existing Middleware to the new API. The guide is for Next.js developers who:

- Currently use the beta Next.js Middleware features
- Choose to upgrade to the next stable version of Next.js

## Using Next.js Middleware on Vercel

If you're using Next.js on Vercel, your existing deploys using Middleware will continue to work, and you can continue to deploy your site using Middleware. When you upgrade your site to the next stable version of Next.js (`v12.2`), you will need to follow this upgrade guide to update your Middleware.

## Breaking changes

1. [No Nested Middleware](#no-nested-middleware)
2. [No Response Body](#no-response-body)
3. [Cookies API Revamped](#cookies-api-revamped)
4. [No More Page Match Data](#no-more-page-match-data)
5. [Executing Middleware on Internal Next.js Requests](#executing-middleware-on-internal-nextjs-requests)

## No Nested Middleware

### Summary of changes

- Define a single Middleware file at the root of your project
- No need to prefix the file with an underscore
- A custom matcher can be used to define matching routes using an exported config object

### Explanation

Previously, you could create a `_middleware.ts` file under the `pages` directory at any level. Middleware execution was based on the file path where it was created. Beta customers found this route matching confusing. For example:

- Middleware in `pages/dashboard/_middleware.ts`
- Middleware in `pages/dashboard/users/_middleware.ts`
- A request to `/dashboard/users/*` **would match both.**

Based on customer feedback, we have replaced this API with a single root Middleware.

### How to upgrade

You should declare **one single Middleware file** in your application, which should be located at the root of the project directory (**not** inside of the `pages` directory), and named **without** an `_` prefix. Your Middleware file can still have either a `.ts` or `.js` extension.

Middleware will be invoked for **every route in the app**, and a custom matcher can be used to define matching filters. The following is an example for a Middleware that triggers for `/about/*`, the custom matcher is defined in an exported config object:

```typescript
// middleware.ts
import type { NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  return NextResponse.rewrite(new URL('/about-2', request.url))
}
// Config with custom matcher
// Pending: https://github.com/vercel/next.js/pull/37177
export const config = {
  matcher: '/about/:path*',
}
```

While the config option is preferred since it doesn't get invoked on every request, you can also use conditional statements to only run the Middleware when it matches specific paths. The following example shows how you can merge two previously nested Middleware:

```typescript
// <root>/middleware.js
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/about')) {
    // This logic is only applied to /about
  }

  if (request.nextUrl.pathname.startsWith('/dashboard')) {
    // This logic is only applied to /dashboard
  }
}
```

## No Response Body

### Summary of changes

- Middleware can no longer respond with a body
- If your Middleware _does_ respond with a body, a runtime error will be thrown
- Migrate to using `rewrites`/`redirects` to pages/APIs handling a response

### Explanation

To help ensure security, we are removing the ability to send response bodies in Middleware. This ensures that Middleware is only used to `rewrite`, `redirect`, or modify the incoming request (e.g. [setting cookies](#cookies-api-revamped)).

Beta customers had explored using Middleware to handle authorization for their application. However, to ensure both the HTML and data payload (JSON file) are protected, we recommend checking authorization at the page level.

The following patterns will no longer work:

```js
new Response('a text value')
new Response(streamOrBuffer)
new Response(JSON.stringify(obj), { headers: 'application/json' })
NextResponse.json()
```

### How to upgrade

For cases where Middleware is used to respond (such as authorization), you should migrate to use `rewrites`/`redirects` to pages that show an authorization error, login forms, or to an API Route.

#### Before

```typescript
// pages/_middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { isAuthValid } from './lib/auth'

export function middleware(request: NextRequest) {
  // Example function to validate auth
  if (isAuthValid(req)) {
    return NextResponse.next()
  }

  return NextResponse.json({ message: 'Auth required' }, { status: 401 })
}
```

#### After

```typescript
// middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { isAuthValid } from './lib/auth'

export function middleware(request: NextRequest) {
  // Example function to validate auth
  if (isAuthValid(req)) {
    return NextResponse.next()
  }

  const loginUrl = new URL('/login', request.url)
  loginUrl.searchParams.set('from', request.nextUrl.pathname)

  return NextResponse.redirect(loginUrl)
}
```

## Cookies API Revamped

### Summary of changes

| Added                   | Removed       |
| ----------------------- | ------------- |
| `cookie.set`            | `cookie`      |
| `cookie.delete`         | `clearCookie` |
| `cookie.getWithOptions` | `cookies`     |

### Explanation

Based on beta feedback, we are changing the Cookies API in `NextRequest` and `NextResponse` to align more to a `get`/`set` model. The `Cookies` API extends Map, including methods like [entries](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/entries) and [values](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/entries).

### How to upgrade

`NextResponse` now has a `cookies` instance with:

- `cookie.delete`
- `cookie.set`
- `cookie.getWithOptions`

As well as other extended methods from `Map`.

#### Before

```javascript
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  // create an instance of the class to access the public methods. This uses `next()`,
  // you could use `redirect()` or `rewrite()` as well
  let response = NextResponse.next()
  // get the cookies from the request
  let cookieFromRequest = request.cookies['my-cookie']
  // set the `cookie`
  response.cookie('hello', 'world')
  // set the `cookie` with options
  const cookieWithOptions = response.cookie('hello', 'world', {
    path: '/',
    maxAge: 1000 * 60 * 60 * 24 * 7,
    httpOnly: true,
    sameSite: 'strict',
    domain: 'example.com',
  })
  // clear the `cookie`
  response.clearCookie('hello')

  return response
}
```

#### After

```typescript
// middleware.ts
export function middleware() {
  const response = new NextResponse()

  // set a cookie
  response.cookies.set('vercel', 'fast')

  // set another cookie with options
  response.cookies.set('nextjs', 'awesome', { path: '/test' })

  // get all the details of a cookie
  const [value, options] = response.cookies.getWithOptions('vercel')
  console.log(value) // => 'fast'
  console.log(options) // => { Path: '/test' }

  // delete a cookie means mark it as expired
  response.cookies.delete('vercel')

  // clear all cookies means mark all of them as expired
  response.cookies.clear()
}
```

## No More Page Match Data

### Summary of changes

- Use [`URLPattern`](https://developer.mozilla.org/en-US/docs/Web/API/URLPattern) to check if a Middleware is being invoked for a certain page match

### Explanation

Currently, Middleware estimates whether you are serving an asset of a Page based on the Next.js routes manifest (internal configuration). This value is surfaced through `request.page`.

To make page and asset matching more accurate, we are now using the web standard `URLPattern` API.

### How to upgrade

Use [`URLPattern`](https://developer.mozilla.org/en-US/docs/Web/API/URLPattern) to check if a Middleware is being invoked for a certain page match.

#### Before

```typescript
// middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const { params } = event.request.page
  const { locale, slug } = params

  if (locale && slug) {
    const { search, protocol, host } = request.nextUrl
    const url = new URL(`${protocol}//${locale}.${host}/${slug}${search}`)
    return NextResponse.redirect(url)
  }
}
```

#### After

```typescript
// middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PATTERNS = [
  [
    new URLPattern({ pathname: '/:locale/:slug' }),
    ({ pathname }) => pathname.groups,
  ],
]

const params = (url) => {
  const input = url.split('?')[0]
  let result = {}

  for (const [pattern, handler] of PATTERNS) {
    const patternResult = pattern.exec(input)
    if (patternResult !== null && 'pathname' in patternResult) {
      result = handler(patternResult)
      break
    }
  }
  return result
}

export function middleware(request: NextRequest) {
  const { locale, slug } = params(request.url)

  if (locale && slug) {
    const { search, protocol, host } = request.nextUrl
    const url = new URL(`${protocol}//${locale}.${host}/${slug}${search}`)
    return NextResponse.redirect(url)
  }
}
```

## Executing Middleware on Internal Next.js Requests

### Summary of changes

- Middleware will be executed for _all_ requests, including `_next`

### Explanation

Prior to Next.js `v12.2`, Middleware was not executed for `_next` requests.

For cases where Middleware is used for authorization, you should migrate to use `rewrites`/`redirects` to Pages that show an authorization error, login forms, or to an API Route.

See [No Reponse Body](#no-response-body) for an example of how to migrate to use `rewrites`/`redirects`.
