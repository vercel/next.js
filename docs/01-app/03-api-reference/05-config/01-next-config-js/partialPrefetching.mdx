---
title: partialPrefetching
description: Configure the default link prefetch behavior to fetch only the static parts of each route.
related:
  title: Related
  description: View related API references and guides.
  links:
    - app/api-reference/config/next-config-js/cacheComponents
    - app/api-reference/file-conventions/route-segment-config/prefetch
    - app/api-reference/components/link
    - app/guides/optimizing-prefetching
---

`partialPrefetching` enables Partial Prefetching at the app level. The framework prefetches the static parts of each route by default; set `prefetch={true}` on individual links to use [per-link prefetching](/docs/app/guides/optimizing-prefetching) and fetch more.

## Usage

```ts filename="next.config.ts" highlight={5} switcher
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
}

export default nextConfig
```

```js filename="next.config.js" highlight={3} switcher
module.exports = {
  cacheComponents: true,
  partialPrefetching: true,
}
```

`partialPrefetching` requires [`cacheComponents`](/docs/app/api-reference/config/next-config-js/cacheComponents). Without it, `next dev` and `next build` throw at config validation.

## Reference

| Value   | Description                                 |
| ------- | ------------------------------------------- |
| `true`  | Enables Partial Prefetching across the app. |
| `false` | Default. No change to prefetch behavior.    |

## How prefetches resolve

Before Partial Prefetching, Next.js prefetched per visible link: a page with N links to N routes produced ~N route prefetches as those links entered the viewport.

With `partialPrefetching: true`, Next.js prefetches one reusable [App Shell](/docs/app/glossary#app-shell) per route instead. The App Shell contains rendered output that does not depend on a link's URL. URL-specific content, including content that depends on `params` or `searchParams`, resolves after navigation by default. App Shells are cached on the client, so links to the same route reuse one prefetch.

The pattern is similar to per-route code splitting in single-page apps: one artifact per route, shared by every link that points to it.

> **Good to know**: Routes that read `cookies()` or `headers()` produce an App Shell that includes session data. The framework auto-detects this and caches the shell per session on the client.

A link can ask for more than the App Shell with [`<Link prefetch={true}>`](/docs/app/api-reference/components/link#prefetch). The prefetch also resolves URL data like `params`, `searchParams`, and the full URL, and the cached content behind it. See [Optimizing prefetching](/docs/app/guides/optimizing-prefetching).

> **Good to know**: If you use `<Link prefetch={true}>` to a route that hasn't opted into Partial Prefetching, a dev console error suggests enabling `partialPrefetching` app-wide or `prefetch = 'partial'` on the segment. The [dev warning Insight](/docs/messages/instant-link-prefetch-partial) covers each fix in detail.

## Per-segment overrides

A segment that exports an explicit [`prefetch`](/docs/app/api-reference/file-conventions/route-segment-config/prefetch) value overrides the app-level default for that route.

## Version History

| Version | Change                                                                     |
| ------- | -------------------------------------------------------------------------- |
| 16.3.0  | `partialPrefetching` introduced. Requires `cacheComponents` to be enabled. |
