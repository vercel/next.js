---
title: Routing with @next/routing
description: Use `@next/routing` to apply Next.js route matching behavior in adapters.
---

You can use [`@next/routing`](https://www.npmjs.com/package/@next/routing) to reproduce Next.js route matching behavior with data from `onBuildComplete`.

> [!NOTE]
> `@next/routing` is experimental and will stabilize with the adapters API.

```typescript
import { resolveRoutes } from '@next/routing'

const pathnames = [
  ...outputs.pages,
  ...outputs.pagesApi,
  ...outputs.appPages,
  ...outputs.appRoutes,
  ...outputs.staticFiles,
].map((output) => output.pathname)

const result = await resolveRoutes({
  url: new URL(requestUrl),
  buildId,
  basePath: config.basePath || '',
  i18n: config.i18n,
  headers: new Headers(requestHeaders),
  requestBody, // ReadableStream
  pathnames,
  routes: routing,
  invokeMiddleware: async (ctx) => {
    // platform-specific middleware invocation
    return {}
  },
})

if (result.resolvedPathname) {
  console.log('Resolved pathname:', result.resolvedPathname)
  console.log('Resolved query:', result.resolvedQuery)
  console.log('Invocation target:', result.invocationTarget)
}
```

`resolveRoutes()` returns:

- `middlewareResponded`: `true` when middleware already sent a response (the adapter should not invoke an entrypoint).
- `externalRewrite`: A `URL` when routing resolved to an external rewrite destination.
- `redirect`: An object with `url` (`URL`) and `status` when the request should be redirected.
- `resolvedPathname`: The route pathname selected by Next.js routing. For dynamic routes, this is the matched route template such as `/blog/[slug]`.
- `resolvedQuery`: The final query after rewrites or middleware have added or replaced search params.
- `invocationTarget`: The concrete pathname and query to invoke for the matched route.
- `resolvedHeaders`: A `Headers` object containing any headers added or modified during routing.
- `status`: An HTTP status code set by routing (for example from a redirect or rewrite rule).
- `routeMatches`: A record of named matches extracted from dynamic route segments.

For example, if `/blog/post-1?draft=1` matches `/blog/[slug]?slug=post-1`, `resolvedPathname` is `/blog/[slug]` while `invocationTarget.pathname` is `/blog/post-1`.
