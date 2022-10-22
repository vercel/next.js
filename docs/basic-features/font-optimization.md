---
description: Optimizing loading web fonts with the built-in `@next/font` loaders.
---

# Optimizing Fonts

[**`@next/font`**](/docs/api-reference/next/font.md.md) will automatically optimize your fonts (including custom fonts) and remove external network requests for improved privacy and performance.

## Overview

`@next/font` includes **built-in automatic self-hosting** for _any_ font file. This means you can optimally load web fonts with zero layout shift, thanks to the underlying CSS `size-adjust` property used.

This new font system also allows you to conveniently use all Google Fonts with performance and privacy in mind. CSS and font files are downloaded at build time and self-hosted with the rest of your static assets. **No requests are sent to Google by the browser.**

## Usage

To get started, install `@next/font`:

```bash
npm install @next/font
```

### Google Fonts

Automatically self-host any Google Font. Fonts are included in the deployment and served from the same domain as your deployment. **No requests are sent to Google by the browser.**

Update `next.config.js` to enable the `@next/font` module:

```js:next.config.js
module.exports = {
  experimental: {
    fontLoaders: [
      { loader: '@next/font/google', options: { subsets: ['latin'] } },
    ],
  },
};
```

> **Note:** You can optionally automatically [subset](https://fonts.google.com/knowledge/glossary/subsetting) Google Fonts to a specific language. This will reduce the size of the font file and improve performance.

Then, import the font you would like to use from `@next/font/google` as a function. We recommend using [**variable fonts**](https://fonts.google.com/variablefonts) for the best performance and flexibility.

```jsx
import { Html, Head, Main, NextScript } from 'next/document'
import { Inter } from '@next/font/google'

// If loading a variable font, you don't need
// to specify the font weight or style
const inter = Inter()

export default function Document() {
  return (
    <Html className={inter.className}>
      <Head />
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
```

If you can't use a variable font, you will **need to specify a weight**:

```jsx:app/layout.tsx
import { Html, Head, Main, NextScript } from 'next/document'
import { Roboto } from '@next/font/google';

const roboto = Roboto({
  weight: '600',
});

export default function Document() {
  return (
    <Html className={roboto.className}>
      <Head />
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
```

View the [Font API Reference](/docs/api-reference/next/font.md#nextfontgoogle) for more information.

### Local Fonts

Update `next.config.js` to enable the `@next/font` module:

```js:next.config.js
module.exports = {
  experimental: {
    fontLoaders: [{ loader: '@next/font/local' }],
  },
};
```

Then, import `@next/font/local` and specify the `src` of your local font file. We recommend using [**variable fonts**](https://fonts.google.com/variablefonts) for the best performance and flexibility.

```jsx
import { Html, Head, Main, NextScript } from 'next/document'
import localFont from '@next/font/local'

// Font files can be colocated inside the `app/` directory
const myFont = localFont({ src: './my-font.woff2' })

export default function Document() {
  return (
    <Html className={myFont.className}>
      <Head />
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
```

View the [Font API Reference](/docs/api-reference/next/font.md#nextfontlocal) for more information.

## Next Steps

<div class="card">
  <a href="/docs/api-reference/next/font.md.md">
    <b>Font API Reference</b>
    <small>See the API Reference for the Font module.</small>
  </a>
</div>

<div class="card">
  <a href="/docs/advanced-features/custom-document.md">
    <b>Custom Document</b>
    <small>Learn how to augment your application's html and body tags.</small>
  </a>
</div>
