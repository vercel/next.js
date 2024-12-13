---
title: inlineCss
description: Enable inline CSS support.
version: experimental
---

## Usage

Experimental support for inlining CSS in the `<head>`. When this flag is enabled, all places where we normally generate a `<link>` tag will instead have a generated `<style>` tag.

```ts filename="next.config.ts" switcher
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    inlineCss: true,
  },
}

export default nextConfig
```

```js filename="next.config.js" switcher
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    inlineCss: true,
  },
}

module.exports = nextConfig
```

## Trade-Offs

### When to Use Inline CSS

Inlining CSS can be beneficial in several scenarios:

- **First-Time Visitors**: Since CSS files are render-blocking resources, inlining eliminates the initial download delay that first-time visitors experience, improving page load performance.

- **Performance Metrics**: By removing the additional network requests for CSS files, inlining can significantly improve key metrics like First Contentful Paint (FCP) and Largest Contentful Paint (LCP).

- **Slow Connections**: For users on slower networks where each request adds considerable latency, inlining CSS can provide a noticeable performance boost by reducing network roundtrips.

- **Atomic CSS Bundles (e.g., Tailwind)**: With utility-first frameworks like Tailwind CSS, the size of the styles required for a page is often O(1) relative to the complexity of the design. This makes inlining a compelling choice because the entire set of styles for the current page is lightweight and doesn’t grow with the page size. Inlining Tailwind styles ensures minimal payload and eliminates the need for additional network requests, which can further enhance performance.

### When Not to Use Inline CSS

While inlining CSS offers significant benefits for performance, there are scenarios where it may not be the best choice:

- **Large CSS Bundles**: If your CSS bundle is too large, inlining it may significantly increase the size of the HTML, resulting in slower Time to First Byte (TTFB) and potentially worse performance for users with slow connections.
- **Dynamic or Page-Specific CSS**: For applications with highly dynamic styles or pages that use different sets of CSS, inlining may lead to redundancy and bloat, as the full CSS for all pages may need to be inlined repeatedly.

- **Browser Caching**: In cases where visitors frequently return to your site, external CSS files allow browsers to cache styles efficiently, reducing data transfer for subsequent visits. Inlining CSS eliminates this benefit.

Evaluate these trade-offs carefully, and consider combining inlining with other strategies, such as critical CSS extraction or a hybrid approach, for the best results tailored to your site's needs.

> **Good to know**:
>
> This feature is currently experimental and has some known limitations:
>
> - CSS inlining is applied globally and cannot be configured on a per-page basis
> - Styles are duplicated during initial page load - once within `<style>` tags for SSR and once in the RSC payload
> - When navigating to statically rendered pages, styles will use `<link>` tags instead of inline CSS to avoid duplication
> - This feature is not available in development mode and only works in production builds
