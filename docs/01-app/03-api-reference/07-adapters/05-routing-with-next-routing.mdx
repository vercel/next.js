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
  url: requestUrl,
  buildId,
  basePath: config.basePath || '',
  i18n: config.i18n,
  headers: requestHeaders,
  requestBody,
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

- `resolvedPathname`: The route pathname selected by Next.js routing. For dynamic routes, this is the matched route template such as `/blog/[slug]`.
- `resolvedQuery`: The final query after rewrites or middleware have added or replaced search params.
- `invocationTarget`: The concrete pathname and query to invoke for the matched route.

For example, if `/blog/post-1?draft=1` matches `/blog/[slug]?slug=post-1`, `resolvedPathname` is `/blog/[slug]` while `invocationTarget.pathname` is `/blog/post-1`.
