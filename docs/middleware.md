---
description: Learn how to use Middleware in Next.js to run code before a request is completed.
---

# Middleware

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

## Examples

Middleware can be used for anything that shares logic for a set of pages, including:

- [Authentication](https://github.com/vercel/examples/tree/main/edge-functions)
- [Bot protection](https://github.com/vercel/examples/tree/main/edge-functions)
- [Redirects and rewrites](https://github.com/vercel/examples/tree/main/edge-functions)
- [Handling unsupported browsers](https://github.com/vercel/examples/tree/main/edge-functions)
- [Feature flags and A/B tests](https://github.com/vercel/examples/tree/main/edge-functions)
- [Server-side analytics](https://github.com/vercel/examples/tree/main/edge-functions)
- [Advanced i18n routing requirements](https://github.com/vercel/examples/tree/main/edge-functions)
- [Logging](https://github.com/vercel/examples/tree/main/edge-functions)

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
