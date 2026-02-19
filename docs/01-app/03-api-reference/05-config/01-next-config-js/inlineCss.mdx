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

- **Enable** if you use atomic CSS (like Tailwind) and want to optimize first-load performance for new visitors
- **Skip** if returning visitors are common and you want them to benefit from cached stylesheets

### When Inline CSS Helps

Normally, the browser must download HTML, parse it, discover CSS `<link>` tags, then request stylesheets before it can render. Inlining [eliminates this request waterfall](https://web.dev/learn/performance/optimize-resource-loading#inline_critical_css), so that styles arrive with the HTML, so the browser can render immediately.

This benefit is strongest with:

- **First-time visitors**: Since CSS files are render-blocking, inlining eliminates the initial download delay that first-time visitors experience. Returning visitors with cached stylesheets won't see this benefit.

- **Performance metrics**: By removing additional network requests for CSS files, inlining can significantly improve [First Contentful Paint (FCP)](https://web.dev/articles/fcp) and [Largest Contentful Paint (LCP)](https://web.dev/articles/lcp).

- **Slow connections**: For users on high-latency networks, each additional request adds delay. Inlining reduces round trips, which matters most when connections are slow.

- **Atomic CSS (Tailwind)**: Utility-first frameworks generate only the classes you use, keeping CSS small. The styles for a page don't grow proportionally with page complexity—they're typically compact regardless of how much UI you build. This makes inlining practical since you get the performance benefit without significantly bloating HTML.

### When External CSS is Better

Inlined styles cannot be cached separately from HTML. Every page load re-downloads the same CSS.

This trade-off matters most with:

- **Returning visitors**: Users who visit your site repeatedly would benefit from cached external stylesheets. With inlining, they re-download styles on every visit.

- **Large CSS bundles**: External stylesheets cache independently and load efficiently on modern infrastructure. Inlined CSS arrives with every HTML response, increasing [Time to First Byte (TTFB)](https://web.dev/articles/ttfb) and preventing browsers from caching styles separately. This trade-off works for small CSS (atomic frameworks like Tailwind), but adds overhead for larger bundles (component libraries like Bootstrap or Material UI).

- **Many pages sharing styles**: External stylesheets cached on one page speed up navigation to other pages. Inlined styles provide no cross-page caching benefit.

> **Good to know**:
>
> This feature is currently experimental and has some known limitations:
>
> - CSS inlining is applied globally and cannot be configured on a per-page basis
> - Styles are duplicated during initial page load - once within `<style>` tags for SSR and once in the RSC payload
> - When navigating to statically rendered pages, styles will use `<link>` tags instead of inline CSS to avoid duplication
> - This feature is not available in development mode and only works in production builds
