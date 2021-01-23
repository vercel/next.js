---
description: Learn how AMP pages are created when used together with `next export`.
---

# AMP in Static HTML export

When using `next export` to do [Static HTML export](/docs/advanced-features/static-html-export.md) statically prerender pages, Next.js will detect if the page supports AMP and change the exporting behavior based on that.

For example, the hybrid AMP page `pages/about.js` would output:

- `out/about.html` - HTML page with client-side React runtime
- `out/about.amp.html` - AMP page

And if `pages/about.js` is an AMP-only page, then it would output:

- `out/about.html` - Optimized AMP page

Next.js will automatically insert a link to the AMP version of your page in the HTML version, so you don't have to, like so:

```jsx
<link rel="amphtml" href="/about.amp.html" />
```

And the AMP version of your page will include a link to the HTML page:

```jsx
<link rel="canonical" href="/about" />
```

When [`trailingSlash`](/docs/api-reference/next.config.js/trailing-slash.md) is enabled the exported pages for `pages/about.js` would be:

- `out/about/index.html` - HTML page
- `out/about.amp/index.html` - AMP page
