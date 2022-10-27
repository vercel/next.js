---
description: Optimizing loading web fonts with the built-in `@next/font` loaders.
---

# Optimizing Fonts

[**`@next/font`**](/docs/api-reference/next/font.md) will automatically optimize your fonts (including custom fonts) and remove external network requests for improved privacy and performance.

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

Import the font you would like to use from `@next/font/google` as a function. We recommend using [**variable fonts**](https://fonts.google.com/variablefonts) for the best performance and flexibility.

```jsx
// app/layout.tsx
import { Inter } from '@next/font/google'

// If loading a variable font, you don't need to specify the font weight
const inter = Inter()

export default function RootLayout({
  children,
}: {
  children: React.ReactNode,
}) {
  return (
    <html lang="en" className={inter.className}>
      <body>{children}</body>
    </html>
  )
}
```

If you can't use a variable font, you will **need to specify a weight**:

```jsx
// app/layout.tsx
import { Roboto } from '@next/font/google'

const roboto = Roboto({
  weight: '400',
})

export default function RootLayout({
  children,
}: {
  children: React.ReactNode,
}) {
  return (
    <html lang="en" className={roboto.className}>
      <body>{children}</body>
    </html>
  )
}
```

#### Specifying a subset

Google Fonts are automatically [subset](https://fonts.google.com/knowledge/glossary/subsetting). This reduces the size of the font file and improves performance. You'll need to define which of these subsets you want to preload. Failing to specify any subsets while [`preload`](/docs/api-reference/next/font.md#preload) is true will result in a warning.

This can be done in 2 ways:

- On a font per font basis by adding it to the function call

  ```tsx
  // app/layout.tsx
  const inter = Inter({ subsets: ['latin'] })
  ```

- Globally for all your fonts in your `next.config.js`

  ```js
  // next.config.js
  module.exports = {
    experimental: {
      fontLoaders: [
        { loader: '@next/font/google', options: { subsets: ['latin'] } },
      ],
    },
  }
  ```

  - If both are configured, the subset in the function call is used.

View the [Font API Reference](/docs/api-reference/next/font.md#nextfontgoogle) for more information.

### Local Fonts

Import `@next/font/local` and specify the `src` of your local font file. We recommend using [**variable fonts**](https://fonts.google.com/variablefonts) for the best performance and flexibility.

```jsx
/// app/layout.tsx
import localFont from '@next/font/local'

// Font files can be colocated inside of `app`
const myFont = localFont({ src: './my-font.woff2' })

export default function RootLayout({
  children,
}: {
  children: React.ReactNode,
}) {
  return (
    <html lang="en" className={localFont.className}>
      <body>{children}</body>
    </html>
  )
}
```

View the [Font API Reference](/docs/api-reference/next/font.md#nextfontlocal) for more information.

## Preloading

When a font function is called on a page of your site, it is not globally available and preloaded on all routes. Rather, the font is only preloaded on the related route/s based on the type of file where it is used:

- if it's a [unique page](https://beta.nextjs.org/docs/routing/pages-and-layouts#pages), it is preloaded on the unique route for that page
- if it's a [layout](https://beta.nextjs.org/docs/routing/pages-and-layouts#layouts), it is preloaded on all the routes wrapped by the layout
- if it's the [root layout](https://beta.nextjs.org/docs/routing/pages-and-layouts#root-layout-required), it is preloaded on all routes

## Reusing fonts

Every time you call the `localFont` or Google font function, that font is hosted as one instance in your application. Therefore, if you load the same font function in multiple files, multiple instances of the same font are hosted. In this situation, it is recommended to do the following:

- Call the font loader function in one shared file
- Export it as a constant
- Import the constant in each file where you would like to use this font

## Next Steps

<div class="card">
  <a href="/docs/api-reference/next/font.md">
    <b>Font API Reference</b>
    <small>See the API Reference for the Font module.</small>
  </a>
</div>

<div class="card">
  <a href="/docs/basic-features/image-optimization.md">
    <b>Image Optimization</b>
    <small>Learn how to optimize images with the Image component.</small>
  </a>
</div>
