---
description: Next.js supports built-in web font optimization to inline font CSS. Learn more here.
---

# Font Optimization

Next.js helps you optimize loading web fonts by inlining font CSS during `next build`. This optimization eliminates an extra network round trip to fetch font declaration files. This results in improvements to [First Contentful Paint (FCP)](https://web.dev/fcp/) and [Largest Contentful Paint (LCP)](https://vercel.com/blog/core-web-vitals#largest-contentful-paint?utm_source=next-site&utm_medium=docs&utm_campaign=next-website). For example, this is the transformation Next.js makes:

```js
// Before
<link
  href="https://fonts.googleapis.com/css2?family=Inter&display=optional"
  rel="stylesheet"
/>

// After
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<style data-href="https://fonts.googleapis.com/css2?family=Inter&display=optional">
  @font-face{font-family:'Inter';font-style:normal...
</style>
```

## Usage

To add a web font to your Next.js application, add the font to a [Custom `Document`](/docs/advanced-features/custom-document.md).

```js
// pages/_document.js

import { Html, Head, Main, NextScript } from 'next/document'

export default function Document() {
  return (
    <Html>
      <Head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter&display=optional"
          rel="stylesheet"
        />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
```

Adding fonts to `_document` is preferred over individual pages. When adding fonts to a single page with [`next/head`](/docs/api-reference/next/head.md), font optimizations included by Next.js will not work on navigations between pages client-side or when using [streaming](/docs/advanced-features/react-18/streaming.md).

Next.js currently supports optimizing Google Fonts and Typekit, with support for other font providers coming soon. We're also planning to add control over [loading strategies](https://github.com/vercel/next.js/issues/21555) and `font-display` values. See [Google Font Display](https://nextjs.org/docs/messages/google-font-display) for more information.

> **Note**: Font Optimization does not currently support self-hosted fonts.

## Disabling Optimization

If you do not want Next.js to optimize your fonts, you can opt-out.

```js
// next.config.js

module.exports = {
  optimizeFonts: false,
}
```

## Optimize CLS for Fonts

Next.js can reduce the Cumulative Layout Shift ([CLS](https://web.dev/cls/)) of your website by adjusting the size of your fallback fonts and inlining the font CSS.

Sites that load fonts with `font-display: swap` usually suffer from ([CLS](https://web.dev/cls/)) when the web font loads and replaces the fallback font. This is due to differences in height, width, and alignment between the main and fallback fonts, which is common even if the CSS font size is the same.

Next.js can reduce CLS automatically by adjusting the size of the fallback font to match that of the main font using font override metric properties such as `size-adjust`, `ascent-override`, `descent-override`, and `line-gap-override`.

To enable this experimental feature, update your `next.config.js` with the following configuration:

```js
module.exports = {
  experimental: {
    adjustFontFallbacks: true,
  },
}
```

When enabled, Next.js will generate a fallback font definition with the correct size overrides in the format `{fontName} Fallback`.
For example, the font `Inter` will generate the fallback font `Inter Fallback`.

You can then use the fallback font in your stylesheets such as the following:

```css
body {
  font-family: 'Inter', 'Inter Fallback', sans-serif;
}
```

> **NOTE**: Next.js currently supports one cross-platform serif font ('Times New Roman') and one cross-platform sans-serif font ('Arial')

The final output will include the fallback override definition.

```html
// Injected into index.html during build/render
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<style data-href="https://fonts.googleapis.com/css2?family=Inter&display=swap">
  @font-face{
    font-family: 'Inter';
    font-style:normal
    ...
  }

  @font-face {
    font-family: 'Inter Fallback',
    src: local('Arial');
    ascent-override: 96.975%;
    ...
  }
</style>
```

## Related

For more information on what to do next, we recommend the following sections:

<div class="card">
  <a href="/docs/advanced-features/custom-document.md">
    <b>Custom Document</b>
    <small>Learn how to augment your application's html and body tags.</small>
  </a>
</div>
