---
description: Next.js supports built-in web font optimization to inline font CSS. Learn more here.
---

# Font Optimization

Since version **10.2**, Next.js has built-in web font optimization.

By default, Next.js will automatically inline font CSS at build time, eliminating an extra round trip to fetch font declarations. This results in improvements to [First Contentful Paint (FCP)](https://web.dev/fcp/) and [Largest Contentful Paint (LCP)](https://vercel.com/blog/core-web-vitals#largest-contentful-paint). For example:

```js
// Before
<link
  href="https://fonts.googleapis.com/css2?family=Inter"
  rel="stylesheet"
/>

// After
<style data-href="https://fonts.googleapis.com/css2?family=Inter">
  @font-face{font-family:'Inter';font-style:normal...
</style>
```

## Usage

To add a web font to your Next.js application, override `next/head`. For example, you can add a font to a specific page:

```js
// pages/index.js

import Head from 'next/head'

export default function IndexPage() {
  return (
    <div>
      <Head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter"
          rel="stylesheet"
        />
      </Head>
      <p>Hello world!</p>
    </div>
  )
}
```

or to your entire application with a [Custom `Document`](/docs/advanced-features/custom-document.md).

```js
// pages/_document.js

import Document, { Html, Head, Main, NextScript } from 'next/document'

class MyDocument extends Document {
  render() {
    return (
      <Html>
        <Head>
          <link
            href="https://fonts.googleapis.com/css2?family=Inter"
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
}

export default MyDocument
```

Automatic Webfont Optimization currently supports Google Fonts and Typekit with support for other font providers coming soon. We're also planning to add control over [loading strategies](https://github.com/vercel/next.js/issues/21555) and `font-display` values.

## Disabling Optimization

If you do not want Next.js to optimize your fonts, you can opt-out.

```js
// next.config.js

module.exports = {
  optimizeFonts: false,
}
```

## Related

For more information on what to do next, we recommend the following sections:

<div class="card">
  <a href="/docs/advanced-features/custom-document.md">
    <b>Custom Document</b>
    <small>Learn how to augment your application's html and body tags.</small>
  </a>
</div>
