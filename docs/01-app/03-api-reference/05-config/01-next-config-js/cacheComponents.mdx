---
title: cacheComponents
description: Learn how to enable the cacheComponents flag in Next.js.
---

Cache Components enables component and function-level caching using the [`use cache`](/docs/app/api-reference/directives/use-cache) directive. Data fetching is dynamic by default, and you choose what to cache at the page, component, or function level. Next.js prerenders a static HTML shell that is served immediately while dynamic content streams in when ready, letting you mix static and dynamic content within a single route.

## Usage

To enable the `cacheComponents` flag, set it to `true` in your `next.config.ts` file:

```ts filename="next.config.ts"
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
}

export default nextConfig
```

When `cacheComponents` is enabled, you can use the following cache functions and configurations:

- The [`use cache` directive](/docs/app/api-reference/directives/use-cache)
- The [`cacheLife` function](/docs/app/api-reference/config/next-config-js/cacheLife) with `use cache`
- The [`cacheTag` function](/docs/app/api-reference/functions/cacheTag)

> **Good to know**: If you used `experimental.useCache` or `experimental.dynamicIO`, migrate using the [Version 16 upgrade guide](/docs/app/guides/upgrading/version-16#experimentaldynamicio-and-experimentalusecache). To migrate route segment configs and other caching patterns, see [Migrating to Cache Components](/docs/app/guides/migrating-to-cache-components).

Additionally, `cacheComponents` implements **[Partial Prerendering (PPR)](/docs/app/glossary#partial-prerendering-ppr)** as the default behavior in the App Router. This means the `experimental.ppr` configuration flag and the `experimental_ppr` route segment configuration are no longer necessary and have been removed.

Read [How rendering works](/docs/app/getting-started/caching#how-rendering-works) for how the static shell and streaming fit together.

> **Good to know**: If you used experimental PPR in Next.js 15, refer to the [Partial Prerendering (PPR)](/docs/app/guides/upgrading/version-16#partial-prerendering-ppr) section of the Version 16 upgrade guide when migrating.

## Navigation with Activity

When `cacheComponents` is enabled, Next.js uses React's [`<Activity>`](https://react.dev/reference/react/Activity) component to preserve component state during client-side navigation.

Rather than unmounting the previous route when you navigate away, Next.js sets the Activity mode to [`"hidden"`](https://react.dev/reference/react/Activity#activity). This means:

- Component state is preserved when navigating between routes
- When you navigate back, the previous route reappears with its state intact
- Effects are cleaned up when a route is hidden, and recreated when it becomes visible again

This behavior improves the navigation experience by maintaining UI state (form inputs, or expanded sections) when users navigate back and forth between routes.

> **Good to know**: Next.js uses heuristics to keep a few recently visited routes `"hidden"`, while older routes are removed from the DOM to prevent excessive growth.

Some UI patterns behave differently when components stay mounted instead of unmounting. See the [Preserving UI state guide](/docs/app/guides/preserving-ui-state) for handling common patterns like dropdowns, dialogs, and testing.

## Version History

| Version | Change                                                                                                                            |
| ------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 16.0.0  | `cacheComponents` introduced. This flag controls the `ppr`, `useCache`, and `dynamicIO` flags as a single, unified configuration. |
