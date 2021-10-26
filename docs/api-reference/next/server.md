---
description: Use Middleware to run code before a request is completed.
---

# next/server

The Middleware API is based upon the native [`FetchEvent`](https://developer.mozilla.org/en-US/docs/Web/API/FetchEvent/FetchEvent), [`Response`](https://developer.mozilla.org/en-US/docs/Web/API/Response), and [`Request`](https://developer.mozilla.org/en-US/docs/Web/API/Request) Web APIs.

These native Web APIs are extended to give you more control over how you manipulate and configure a response, based on the incoming requests.

## NextFetchEvent

The `NextFetchEvent` API extends the native [`FetchEvent`](https://developer.mozilla.org/en-US/docs/Web/API/FetchEvent/FetchEvent) Web API, by including the [`request`](https://developer.mozilla.org/en-US/docs/Web/API/FetchEvent/request) property and and [`waitUntil()`](https://developer.mozilla.org/en-US/docs/Web/API/ExtendableEvent/waitUntil) method.

`waitUntil()` is a method, accessible on `NextFetchEvent`, used to prolong the execution of the function _*after*_ a response has run. If you want to run additional code once a response has been run, you have to call `waitUntil()`, or [`NextResponse.next()`](#next-response).

The event API is fully typed. To use the types, import from `next/server`.

```tsx
import { NextFetchEvent } from 'next/server'
```

## NextRequest

The `NextRequest` API is an extension of the [`Request`](https://developer.mozilla.org/en-US/docs/Web/API/Request) Web API, with the following added methods and properties:

- `cookies` - Has the cookies from the `Request`
- `nextUrl` - Includes an extended, parsed, URL object that gives you access to individual values such as `pathname`. It also includes Next.js specific properties, such as `basePath`, `trailingSlash` and `i18n`
- `geo` - Has the geo location from the `Request`
  - `geo.region` - The region code
  - `geo.city` - The city
  - `geo.country` - The country code
  - `geo.longitude` - The longitude
  - `geo.latitude` - The latitude
- `ip` - Has the IP address from the `Request`
- `ua` - Has the user agent

You can use the `NextRequest` API as a direct replacement for the native `Request` Web API, giving you more control over how you manipulate the request.

The request API is fully typed. To use the types, import from `next/server`.

```tsx
import type { NextRequest } from 'next/server'
```

## NextResponse

The `NextResponse` API is an extension of the [`Response`](https://developer.mozilla.org/en-US/docs/Web/API/Response) Web API, with the following added methods and properties:

- `cookies` - Has the cookies from the `Response`
- `clearCookies()` - Clear the cookies from the `Response`
- `redirect()` - Redirect the `Response`
- `rewrite()` - Rewrite the `Response`
- `next()` - Continue the `middleware` function _*after*_ the response has resolved it's Promise

`NextResponse` can be used instead of the native `Response` Web API when creating a Promise inside of the `respondWith()` method.

To use, import from `next/server`.

```tsx
import type { NextRequest } from 'next/server'
```

### Why does redirect use 307 and 308?

When using `redirect()` you may notice that the status codes used are `307` for a temporary redirect, and `308` for a permanent redirect. While traditionally a `302` was used for a temporary redirect, and a `301` for a permanent redirect, many browsers changed the request type of the redirect, from a `POST` to `GET` request, regardless of the origins request type.

Taking the following example of a redirect from `/users` to `/people`, if you make a `POST` request to `/users` to create a new user, and are conforming to a `302` temporary redirect, the request type will be changed from a `POST` to a `GET` request. This doesn't make sense, as to create a new user, you should be making a `POST` request to `/people`.

The introduction of the `307` status code means that the request type is preserved as `POST`.

## Related

<div class="card">
  <a href="/docs/api-reference/edge-runtime.md">
    <b>Edge Runtime</b>
    <small>Learn more about the supported Web APIs available.</small>
  </a>
</div>

<div class="card">
  <a href="/docs/middleware.md">
    <b>Middleware</b>
    <small>Run code before a request is completed.</small>
  </a>
</div>
