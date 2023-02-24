---
description: Optimizing loading web fonts with the built-in `next/font` loaders.
---

# Optimizing Fonts

[**`next/font`**](/docs/api-reference/next/font.md) will automatically optimize your fonts (including custom fonts) and remove external network requests for improved privacy and performance.

> **🎥 Watch:** Learn more about how to use `next/font` → [YouTube (6 minutes)](https://www.youtube.com/watch?v=L8_98i_bMMA).

## Overview

`next/font` includes **built-in automatic self-hosting** for _any_ font file. This means you can optimally load web fonts with zero layout shift, thanks to the underlying CSS `size-adjust` property used.

This new font system also allows you to conveniently use all Google Fonts with performance and privacy in mind. CSS and font files are downloaded at build time and self-hosted with the rest of your static assets. **No requests are sent to Google by the browser.**

### Google Fonts

Automatically self-host any Google Font. Fonts are included in the deployment and served from the same domain as your deployment. **No requests are sent to Google by the browser.**

To get started, import the font you would like to use from `next/font/google` as a function. We recommend using [**variable fonts**](https://fonts.google.com/variablefonts) for the best performance and flexibility.

To use the font in all your pages, add it to [`_app.js` file](https://nextjs.org/docs/advanced-features/custom-app) under `/pages` as shown below:

```js
// pages/_app.js
import { Inter } from 'next/font/google'

// If loading a variable font, you don't need to specify the font weight
const inter = Inter({ subsets: ['latin'] })

export default function MyApp({ Component, pageProps }) {
  return (
    <main className={inter.className}>
      <Component {...pageProps} />
    </main>
  )
}
```

If you can't use a variable font, you will **need to specify a weight**:

```js
// pages/_app.js
import { Roboto } from 'next/font/google'

const roboto = Roboto({
  weight: '400',
  subsets: ['latin'],
})

export default function MyApp({ Component, pageProps }) {
  return (
    <main className={roboto.className}>
      <Component {...pageProps} />
    </main>
  )
}
```

You can specify multiple weights and/or styles by using an array:

```js
const roboto = Roboto({
  weight: ['400', '700'],
  style: ['normal', 'italic'],
  subsets: ['latin'],
})
```

> **Note**: You can use `_` for fonts with spaces in the name. For example `Titillium Web` should be `Titillium_Web`.

#### Apply the font in `<head>`

You can also use the font without a wrapper and `className` by injecting it inside the `<head>` as follows:

```js
// pages/_app.js
import { Inter } from 'next/font/google'

const inter = Inter({ subsets: ['latin'] })

export default function MyApp({ Component, pageProps }) {
  return (
    <>
      <style jsx global>{`
        html {
          font-family: ${inter.style.fontFamily};
        }
      `}</style>
      <Component {...pageProps} />
    </>
  )
}
```

#### Single page usage

To use the font on a single page, add it to the specific page as shown below:

```js
// pages/index.js
import { Inter } from 'next/font/google'

const inter = Inter({ subsets: ['latin'] })

export default function Home() {
  return (
    <div className={inter.className}>
      <p>Hello World</p>
    </div>
  )
}
```

#### Specifying a subset

Google Fonts are automatically [subset](https://fonts.google.com/knowledge/glossary/subsetting). This reduces the size of the font file and improves performance. You'll need to define which of these subsets you want to preload. Failing to specify any subsets while [`preload`](/docs/api-reference/next/font.md#preload) is true will result in a warning.

This can be done in 2 ways:

- On a font per font basis by adding it to the function call

  ```js
  // pages/_app.js
  const inter = Inter({ subsets: ['latin'] })
  ```

- Globally for all your fonts in your `next.config.js`

  ```js
  // next.config.js
  module.exports = {
    experimental: {
      fontLoaders: [
        { loader: 'next/font/google', options: { subsets: ['latin'] } },
      ],
    },
  }
  ```

  - If both are configured, the subset in the function call is used.

View the [Font API Reference](/docs/api-reference/next/font.md#nextfontgoogle) for more information.

### Local Fonts

Import `next/font/local` and specify the `src` of your local font file. We recommend using [**variable fonts**](https://fonts.google.com/variablefonts) for the best performance and flexibility.

```js
// pages/_app.js
import localFont from 'next/font/local'

// Font files can be colocated inside of `pages`
const myFont = localFont({ src: './my-font.woff2' })

export default function MyApp({ Component, pageProps }) {
  return (
    <main className={myFont.className}>
      <Component {...pageProps} />
    </main>
  )
}
```

If you want to use multiple files for a single font family, `src` can be an array:

```js
const roboto = localFont({
  src: [
    {
      path: './Roboto-Regular.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: './Roboto-Italic.woff2',
      weight: '400',
      style: 'italic',
    },
    {
      path: './Roboto-Bold.woff2',
      weight: '700',
      style: 'normal',
    },
    {
      path: './Roboto-BoldItalic.woff2',
      weight: '700',
      style: 'italic',
    },
  ],
})
```

View the [Font API Reference](/docs/api-reference/next/font.md#nextfontlocal) for more information.

## With Tailwind CSS

`next/font` can be used with Tailwind CSS through a [CSS variable](/docs/api-reference/next/font#css-variables).

In the example below, we use the font `Inter` from `next/font/google` (You can use any font from Google or Local Fonts). Load your font with the `variable` option to define your CSS variable name and assign it to `inter`. Then, use `inter.variable` to add the CSS variable to your HTML document.

```js
// pages/_app.js
import { Inter } from 'next/font/google'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

export default function MyApp({ Component, pageProps }) {
  return (
    <main className={`${inter.variable} font-sans`}>
      <Component {...pageProps} />
    </main>
  )
}
```

Finally, add the CSS variable to your [Tailwind CSS config](https://github.com/vercel/next.js/tree/canary/examples/with-tailwindcss):

```js
// tailwind.config.js
const { fontFamily } = require('tailwindcss/defaultTheme')

/** @type {import('tailwindcss').Config} \*/
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', ...fontFamily.sans],
      },
    },
  },
  plugins: [],
}
```

You can now use the `font-sans` utility class to apply the font to your elements.

## Preloading

When a font function is called on a page of your site, it is not globally available and preloaded on all routes. Rather, the font is only preloaded on the related route/s based on the type of file where it is used:

- if it's a [unique page](/docs/basic-features/pages), it is preloaded on the unique route for that page
- if it's in the [custom App](/docs/advanced-features/custom-app), it is preloaded on all the routes of the site under `/pages`

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
