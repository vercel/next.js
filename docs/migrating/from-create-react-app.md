---
description: Learn how to transition an existing Create React App project to Next.js.
---

# Migrating from Create React App

This guide will help you understand how to transition from an existing non-ejected Create React App project to Next.js. Migrating to Next.js will allow you to:

- Choose which [data fetching](/docs/basic-features/data-fetching.md) strategy you want on a per-page basis.
- Use [Incremental Static Regeneration](/docs/basic-features/data-fetching.md#incremental-static-regeneration) to update _existing_ pages by re-rendering them in the background as traffic comes in.
- Use [API Routes](/docs/api-routes/introduction.md).

And more! Let’s walk through a series of steps to complete the migration.

## Updating `package.json` and dependencies

The first step towards migrating to Next.js is to update `package.json` and dependencies. You should:

- Remove `react-scripts` (but keep `react` and `react-dom`). If you're using React Router, you can also remove `react-router-dom`.
- Install `next`.
- Add Next.js related commands to `scripts`. One is `next dev`, which runs a development server at `localhost:3000`. You should also add `next build` and `next start` for creating and starting a production build.

Here's an example `package.json`:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "next": "latest",
    "react": "latest",
    "react-dom": "latest"
  }
}
```

## Static Assets and Compiled Output

Create React App uses the `public` directory for the [entry HTML file](https://create-react-app.dev/docs/using-the-public-folder), whereas Next.js uses it for static assets. It's possible to add static assets here, but Create React App recommends importing them directly from JavaScript files.

- Move any images, fonts, or other static assets to `public`.
- Convert `index.html` (the entry point of your application) to Next.js. Any `<head>` code should be moved to a [custom `_document.js`](/docs/advanced-features/custom-document.md). Any shared layout between all pages should be moved to a [custom `_app.js`](/docs/advanced-features/custom-app.md).
- See [Styling](#styling) for CSS/Sass files.
- Add `.next` to `.gitignore`.

## Creating Routes & Linking

With Create React App, you're likely using React Router. Instead of using a third-party library, Next.js includes its own [file-system based routing](/docs/routing/introduction.md).

- Convert all `Route` components to new files in the `pages` directory.
- For routes that require dynamic content (e.g. `/blog/:slug`), you can use [Dynamic Routes](/docs/routing/dynamic-routes.md) with Next.js (e.g. `pages/blog/[slug].js`). The value of `slug` is accessible through a [query parameter](/docs/routing/dynamic-routes.md). For example, the route `/blog/first-post` would forward the query object `{ 'slug': 'first-post' }` to `pages/blog/[slug].js` ([learn more here](/docs/basic-features/data-fetching.md#getstaticpaths-static-generation)).

For more information, see [Migrating from React Router](/docs/migrating/from-react-router.md).

## Styling

Next.js has built-in support for [CSS](/docs/basic-features/built-in-css-support.md), [Sass](/docs/basic-features/built-in-css-support.md#sass-support) and [CSS-in-JS](/docs/basic-features/built-in-css-support.md#css-in-js).

With Create React App, you can import `.css` files directly inside React components. Next.js allows you to do the same, but requires these files to be [CSS Modules](/docs/basic-features/built-in-css-support.md). For global styles, you'll need a [custom `_app.js`](/docs/advanced-features/custom-app.md) to add a [global stylesheet](docs/basic-features/built-in-css-support.md#adding-a-global-stylesheet).

## Safely Accessing Web APIs

With client-side rendered applications (like Create React App), you can access `window`, `localStorage`, `navigator`, and other [Web APIs](https://developer.mozilla.org/en-US/docs/Web/API) out of the box.

Since Next.js uses [pre-rendering](/docs/basic-features/pages.md#pre-rendering), you'll need to safely access those Web APIs only when you're on the client-side. For example, the following code snippet will allow access to `window` only on the client-side.

```jsx
if (typeof window !== 'undefined') {
  // You now have access to `window`
}
```

A recommended way of accessing Web APIs safely is by using the [`useEffect`](https://reactjs.org/docs/hooks-effect.html) hook, which only executes client-side:

```jsx
import { useEffect } from 'react'

useEffect(() => {
  // You now have access to `window`
}, [])
```

## Image Component and Image Optimization

Since version **10.0.0**, Next.js has a built-in [Image Component and Automatic Image Optimization](/docs/basic-features/image-optimization.md).

The Next.js Image Component, [`next/image`](/docs/api-reference/next/image.md), is an extension of the HTML `<img>` element, evolved for the modern web.

The Automatic Image Optimization allows for resizing, optimizing, and serving images in modern formats like [WebP](https://developer.mozilla.org/en-US/docs/Web/Media/Formats/Image_types) when the browser supports it. This avoids shipping large images to devices with a smaller viewport. It also allows Next.js to automatically adopt future image formats and serve them to browsers that support those formats.

Instead of optimizing images at build time, Next.js optimizes images on-demand, as users request them. Your build times aren't increased, whether shipping 10 images or 10 million images.

```jsx
import Image from 'next/image'

export default function Home() {
  return (
    <>
      <h1>My Homepage</h1>
      <Image
        src="/me.png"
        alt="Picture of the author"
        width={500}
        height={500}
      />
      <p>Welcome to my homepage!</p>
    </>
  )
}
```

## Environment Variables

Next.js has support for `.env` [Environment Variables](/docs/basic-features/environment-variables.md) similar to Create React App. The main different is the prefix used to expose environment variables on the client-side.

- Change all environment variables with the `REACT_APP_` prefix to `NEXT_PUBLIC_`.
- Server-side environment variables will be available at build-time and in [API Routes](/docs/api-routes/introduction.md).

## Search Engine Optimization

Most Create React App examples use `react-helmet` to assist with adding `meta` tags for proper SEO. With Next.js, we use [`next/head`](/docs/api-reference/next/head.md) to add `meta` tags to your `<head />` element. For example, here's an SEO component with Create React App:

```jsx
// src/components/seo.js

import { Helmet } from 'react-helmet'

export default function SEO({ description, title, siteTitle }) {
  return (
    <Helmet
      title={title}
      titleTemplate={siteTitle ? `%s | ${siteTitle}` : null}
      meta={[
        {
          name: `description`,
          content: description,
        },
        {
          property: `og:title`,
          content: title,
        },
        {
          property: `og:description`,
          content: description,
        },
        {
          property: `og:type`,
          content: `website`,
        },
        {
          name: `twitter:card`,
          content: `summary`,
        },
        {
          name: `twitter:creator`,
          content: twitter,
        },
        {
          name: `twitter:title`,
          content: title,
        },
        {
          name: `twitter:description`,
          content: description,
        },
      ]}
    />
  )
}
```

And here's the same example using Next.js.

```jsx
// src/components/seo.js

import Head from 'next/head'

export default function SEO({ description, title, siteTitle }) {
  return (
    <Head>
      <title>{`${title} | ${siteTitle}`}</title>
      <meta name="description" content={description} />
      <meta property="og:type" content="website" />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:site_name" content={siteTitle} />
      <meta property="twitter:card" content="summary" />
      <meta property="twitter:creator" content={config.social.twitter} />
      <meta property="twitter:title" content={title} />
      <meta property="twitter:description" content={description} />
    </Head>
  )
}
```

## Single-Page App (SPA)

If you want to move your existing Create React App to Next.js and keep a Single-Page App, you can move your old application's entry point to an [Optional Catch-All Route](/docs/routing/dynamic-routes.md#optional-catch-all-routes) named `pages/[[…app]].js`.

```jsx
// pages/[[...app]].js

import { useState, useEffect } from 'react'
import CreateReactAppEntryPoint from '../components/app'

function App() {
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  if (!isMounted) {
    return null
  }

  return <CreateReactAppEntryPoint />
}

export default App
```

## Ejected Create React App

If you've ejected Create React App, here are some things to consider:

- If you have custom file loaders set up for CSS, Sass, or other assets, this is all built-in with Next.js.
- If you've manually added [new JavaScript features](/docs/basic-features/supported-browsers-features.md#javascript-language-features) (e.g. Optional Chaining) or [Polyfills](/docs/basic-features/supported-browsers-features.md#polyfills), check to see what's included by default with Next.js.
- If you have a custom code splitting setup, you can remove that. Next.js has automatic code splitting on a [per-page basis](/docs/basic-features/pages.md).
- You can [customize your PostCSS setup](/docs/advanced-features/customizing-postcss-config.md#default-behavior) with Next.js without ejecting from the framework.
- You should reference the default [Babel config](/docs/advanced-features/customizing-babel-config.md) and [Webpack config](/docs/api-reference/next.config.js/custom-webpack-config.md) of Next.js to see what's included by default.

## Learn More

You can learn more about Next.js by completing our [starter tutorial](https://nextjs.org/learn/basics/getting-started). If you have questions or if this guide didn't work for you, feel free to reach out to our community on [GitHub Discussions](https://github.com/vercel/next.js/discussions).
