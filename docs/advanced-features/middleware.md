---
description: Learn how to use Middleware in Next.js to run code before a request is completed.
---

# Middleware (Beta)

<details open>
  <summary><b>Version History</b></summary>

| Version   | Changes                                                                                    |
| --------- | ------------------------------------------------------------------------------------------ |
| `v12.0.9` | Enforce absolute URLs in Edge Runtime ([PR](https://github.com/vercel/next.js/pull/33410)) |
| `v12.0.0` | Middleware (Beta) added.                                                                   |

</details>

Middleware enables you to use code over configuration. This gives you full flexibility in Next.js, because you can run code before a request is completed. Based on the user's incoming request, you can modify the response by rewriting, redirecting, adding headers, or even streaming HTML.

## Usage

1. Install the latest version of Next.js:

```jsx
npm install next@latest
```

2. Then, create a `_middleware.ts` file under your `/pages` directory.

3. Finally, export a middleware function from the `_middleware.ts` file.

```jsx
// pages/_middleware.ts

import type { NextFetchEvent, NextRequest } from 'next/server'

export function middleware(req: NextRequest, ev: NextFetchEvent) {
  return new Response('Hello, world!')
}
```

In this example, we use the standard Web API Response ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Response)).

## API

Middleware is created by using a `middleware` function that lives inside a `_middleware` file. Its API is based upon the native [`FetchEvent`](https://developer.mozilla.org/en-US/docs/Web/API/FetchEvent), [`Response`](https://developer.mozilla.org/en-US/docs/Web/API/Response), and [`Request`](https://developer.mozilla.org/en-US/docs/Web/API/Request) objects.

These native Web API objects are extended to give you more control over how you manipulate and configure a response, based on the incoming requests.

The function signature:

```ts
import type { NextFetchEvent } from 'next/server'
import type { NextRequest } from 'next/server'

export type Middleware = (
  request: NextRequest,
  event: NextFetchEvent
) => Promise<Response | undefined> | Response | undefined
```

The function can be a default export and as such, does **not** have to be named `middleware`. Though this is a convention. Also note that you only need to make the function `async` if you are running asynchronous code.

[Read the full Middleware API reference.](/docs/api-reference/next/server.md)

## Examples

Middleware can be used for anything that shares logic for a set of pages, including:

- [Authentication](https://github.com/vercel/examples/tree/main/edge-functions)
- [Bot protection](https://github.com/vercel/examples/tree/main/edge-functions)
- [Redirects and rewrites](https://github.com/vercel/examples/tree/main/edge-functions)
- [Handling unsupported browsers](https://github.com/vercel/examples/tree/main/edge-functions)
- [Feature flags and A/B tests](https://github.com/vercel/examples/tree/main/edge-functions)
- [Advanced i18n routing requirements](https://github.com/vercel/examples/tree/main/edge-functions)

## Execution Order

If your Middleware is created in `/pages/_middleware.ts`, it will run on all routes within the `/pages` directory. The below example assumes you have `about.tsx` and `teams.tsx` routes.

```bash
- package.json
- /pages
    _middleware.ts # Will run on all routes under /pages
    index.tsx
    about.tsx
    teams.tsx
```

If you _do_ have sub-directories with nested routes, Middleware will run from the top down. For example, if you have `/pages/about/_middleware.ts` and `/pages/about/team/_middleware.ts`, `/about` will run first and then `/about/team`. The below example shows how this works with a nested routing structure.

```bash
- package.json
- /pages
    index.tsx
    - /about
      _middleware.ts # Will run first
      about.tsx
      - /teams
        _middleware.ts # Will run second
        teams.tsx
```

Middleware runs directly after `redirects` and `headers`, before the first filesystem lookup. This excludes `/_next` files.

## Deployment

Middleware uses a [strict runtime](/docs/api-reference/edge-runtime.md) that supports standard Web APIs like `fetch`. This works out of the box using `next start`, as well as on Edge platforms like Vercel, which use [Edge Functions](http://www.vercel.com/edge).

## Related

<div class="card">
  <a href="/docs/api-reference/next/server.md">
    <b>Middleware API Reference</b>
    <small>Learn more about the supported APIs for Middleware.</small>
  </a>
</div>

<div class="card">
  <a href="/docs/api-reference/edge-runtime.md">
    <b>Edge Runtime</b>
    <small>Learn more about the supported Web APIs available.</small>
  </a>
</div>
