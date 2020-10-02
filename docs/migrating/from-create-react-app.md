---
description: Learn how to transition an existing React App project to Next.js.
---

# Migrating from Create React App

This guide will help you understand how to transition from an existing Create React App project to Next.js. Migrating to Next.js will allow you to:

- Choose which [data fetching](/docs/basic-features/data-fetching.md) strategy you want on a per-page basis.
- Use [Incremental Static Regeneration](/docs/basic-features/data-fetching.md#incremental-static-regeneration) to update _existing_ pages by re-rendering them in the background as traffic comes in.
- Use [API Routes](/docs/api-routes/introduction.md).

And more! Let’s walk through a series of steps to complete the migration.

## Updating `package.json` and dependencies

The first step towards migrating to Next.js is to update `package.json` and dependencies. You should:

- Remove all Create-React-App-related packages, for example `react-scripts` (but keep `react` and `react-dom`).
- Install `next`.
```shell
npm install next
# or
yarn add next
```
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

Create React App uses the `public` directory for the base index.html and static assets, whereas Next.js only uses it for static assets. Here are the steps for migration:

- Remove `index.html` and the other files in `public` directory, only leave the `favicon.ico` you would like to use for your app.
- Add `.next` to `.gitignore`.

## Creating Routes

Next manages routing through the `pages` directory, which uses [file-system based routing](/docs/routing/introduction.md)

On the other hand, Create React App doesn't prescribe a specific routing solution, but React Router is the most popular one. ([see more](https://create-react-app.dev/docs/adding-a-router/)). 

Create a `pages/` directory and migrate the files present in `src/` directory here. As they are created as a React Component, the same way **pages** are created in Next. ([See more](/docs/basic-features/pages.md#pages)). For instance, if you copy `App.js`, you can navigate to it your running project in the browser with the route `/App`.

## Styling

With Create React App, global CSS imports can be done inside any React Component. With Next, you should create a [custom `_app.js`](/docs/advanced-features/custom-app.md) for global CSS. When migrating, you can copy over your CSS imports directly and update the relative file path, if necessary. Next.js has [built-in CSS support](/docs/basic-features/built-in-css-support.md).

## Links

Create-React-App uses the `link` html element, whereas Next.js has its own component [`Link`](/docs/api-reference/next/link.md). In order to use the Next.js component you will need to add import statements referencing `Link`:

```js
import Link from 'next/link'
```

Good news is both `link` (html) and `Link` (Next.js) have a `href="/route"` attribute.

## Data Fetching

React doesn't prescribe a specific approach to data fetching, but people commonly use either a library like `axios` or the `fetch()` API provided by the browser. ([See more](https://create-react-app.dev/docs/fetching-data-with-ajax-requests/))

With Next.js, you can choose on a [per-page basis](/docs/basic-features/pages.md) which [data fetching strategy](/docs/basic-features/data-fetching.md) you want. For example, `getServerSideProps` allows you to do server-side rendering. If you wanted to generate a static page, you'd export `getStaticProps` / `getStaticPaths` inside the page, rather than using `pageQuery`. For example:

```js
import remark from 'remark'
import html from 'remark-html'
import { getPostBySlug, getAllPosts } from '../lib/blog'

export async function getStaticProps({ params }) {
  const post = getPostBySlug(params.slug)
  const content = await remark()
    .use(html)
    .process(post.content || '')
    .toString()

  return {
    props: {
      ...post,
      content,
    },
  }
}

export async function getStaticPaths() {
  const posts = getAllPosts()

  return {
    paths: posts.map((post) => {
      return {
        params: {
          slug: post.slug,
        },
      }
    }),
    fallback: false,
  }
}
```

## Site Configuration

With Create-React-App, your site's metadata (name, description, etc) is injected directly into the `index.html` located in `public/` directory with traditional html tags. ([See more](https://create-react-app.dev/docs/title-and-meta-tags))

With Next.js, we recommend creating a config file similar to below. You can then import this file anywhere.

```js
// src/config.js

export default {
  title: 'Starter Blog',
  author: {
    name: 'Juliana Jaime',
    summary: 'who loves Next.js.',
  },
  description: 'A starter blog converting Creat React App -> Next.',
  social: {
    twitter: 'peppermintNDais',
  },
}
```

## Search Engine Optimization

A part from editing `meta tags` in `index.html`, Create React App recommends using `react-helmet` to assist with adding `meta` tags for proper SEO. With Next.js, we recommend using [`next/head`](/docs/api-reference/next/head.md) to add `meta` tags to your `<head />` element. For example, here's part of an SEO component with Gatsby:

```js
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

And here's the same example using Next.js, including reading from a site config file.

```js
// src/components/seo.js

import Head from 'next/head'
import config from '../config'

export default function SEO({ description, title }) {
  const siteTitle = config.title

  return (
    <Head>
      <title>{`${title} | ${siteTitle}`}</title>
      <meta name="robots" content="follow, index" />
      <meta content={description} name="description" />
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

## Learn more

If you have questions, please ask on [our discussion board](https://github.com/vercel/next.js/discussions).