---
description: Learn how to transition an existing Gatsby project to Next.js.
---

# Migrating from Gatsby

This guide will help you understand how to transition from an existing Gatsby project to Next.js. Since both frameworks are built on top of React, the transition can be broken down into a series of steps. Migrating to Next.js will allow you to:

- Choose which [data fetching](/docs/basic-features/data-fetching) strategy you want on a per-page basis (instead of only SSG)
- Use [Incremental Static Regeneration](/docs/basic-features/data-fetching#incremental-static-regeneration) to update _existing_ pages by re-rendering them in the background as traffic comes in
- Use [API Routes](/docs/api-routes/introduction)

And more! First, let's talk about running a Next.js application.

## Local Development

Gatsby applications start using `gatsby develop` and run at `localhost:8000`. To create and start a production build, you run `gatsby build && gatsby serve`. Your compiled code is located at `public/`.

Next applications start using `next dev` and run at `localhost:3000`. To create a start a production build, run `next build && next start`. Your compiled code is located at `.next/`.

The first step towards migrating to Next.js is to uninstall all related Gatsby packages and install `next`. Do not remove `react` or `react-dom` from your `package.json`. Here's an example `package.json`:

```json
{
  "scripts": {
    "dev": "next",
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

## Serving Files

The `public/` folder holds static assets in Next.js, instead of containing the compiled output. Update your `.gitignore` file to ensure `public/` is tracked in source control and delete your existing Gatsby output. You can now move files from Gatsby's `static/` folder to `public/`.

## Creating Routes

Both Gatsby and Next support a `pages` folder, which uses [file-system based routing](/docs/routing/introduction). Gatsby's directory is `src/pages`, which is also [supported by Next.js](/docs/advanced-features/src-directory).

Gatsby creates dynamic routes using the `createPages` API inside of `gatsby-node.js`. With Next, we can use [Dynamic Routes](/docs/routing/dynamic-routes) inside of `pages` to achieve the same effect. Rather than having a `template` folder, you can use the React component inside your dynamic route file. For example:

- **Gatsby:** `createPages` API inside `gatsby-node.js` for each blog post, then have a template file at `src/templates/blog-post.js`.
- **Next:** Create `pages/blog/[slug].js` which contains the blog post template. The value of `slug` is accessible through a [query parameter](/docs/routing/dynamic-routes). For example, the route `/blog/first-post` would forward the query object `{ 'slug': 'first-post' }` to `pages/blog/[slug].js`.

## Styling

With Gatsby, global CSS imports and included in `gatsby-browser.js`. With Next, you should create a [custom `_app.js`](/docs/advanced-features/custom-app) for global CSS. When migrating, you can copy your CSS imports over directly and update the relative file path, if necessary. Next.js has [built-in CSS support](/docs/basic-features/built-in-css-support).

## Links

The Gatsby `Link` and Next.js [`Link`](/docs/api-reference/next/link>) component have a slightly different API. First, you will need to update any import statements referencing `Link` from Gatsby to:

```js
import Link from 'next/link'
```

Next, you can find and replace usages of `to="/route"` with `href="/route"`.

## Data Fetching

The largest difference between Gatsby and Next.js is how data fetching is implemented. Gatsby is opinionated with GraphQL being the default strategy for retrieving data across your application. With Next.js, you get to choose which strategy you want (GraphQL is one supported option).

Gatsby uses the `graphql` tag to query data in the pages of your site. This may include local data, remote data, or information about your site configuration. Gatsby only allows the creation of static pages. With Next.js, you can choose on a [per-page basis](/docs/basic-features/pages) which [data fetching strategy](/docs/basic-features/data-fetching) you want. For example, `getServerSideProps` allows you to do server-side rendering. If you wanted to generate a static site, you'd export `getStaticProps` / `getStaticPaths` inside the page, rather than using `pageQuery`. For example:

```js
import { getPostBySlug, getAllPosts } from '../lib/blog'

export async function getStaticProps({ params }) {
  const post = getPostBySlug(params.slug)

  return {
    props: {
      ...post,
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

You'll commonly see Gatsby plugins used for reading the file system (`gatsby-source-filesystem`), handling markdown files (`gatsby-transformer-remark`), and so on. For example, the popular starter blog example has [15 Gatsby specific packages](https://github.com/gatsbyjs/gatsby-starter-blog/blob/master/package.json). Next takes a different approach. It includes common features like [image optimization](https://github.com/vercel/next.js/discussions/17141) directly inside the framework, and gives the user full control over integrations with external packages. For example, rather than abstracting reading from the file system to a plugin, you can use the native Node.js `fs` package inside `getStaticProps` / `getStaticPaths` to read from the file system.

```js
import fs from 'fs'
import { join } from 'path'
import matter from 'gray-matter'
import { parseISO, format } from 'date-fns'

const postsDirectory = join(process.cwd(), 'content', 'blog')

export function getPostBySlug(slug) {
  const realSlug = slug.replace(/\\.md$/, '')
  const fullPath = join(postsDirectory, `${realSlug}.md`)
  const fileContents = fs.readFileSync(fullPath, 'utf8')
  const { data, content } = matter(fileContents)
  const date = format(parseISO(data.date), 'MMMM dd, yyyy')

  return { slug: realSlug, frontmatter: { ...data, date }, content }
}

export function getAllPosts() {
  const slugs = fs.readdirSync(postsDirectory)
  const posts = slugs.map((slug) => getPostBySlug(slug))

  return posts
}
```

## Site Configuration

With Gatsby, your site's metadata (name, description, etc) is located inside `gatsby-config.js`. This is then exposed through the GraphQL API and consumed through a `pageQuery` or a static query inside a component.

With Next.js, we recommend creating a config file similar to below. You can then import this file anywhere without having to use GraphQL to access your site's metadata.

```js
// src/config.js

export default {
  title: 'Starter Blog',
  author: {
    name: 'Lee Robinson',
    summary: 'who loves Next.js.',
  },
  description: 'A starter blog converting Gatsby -> Next.',
  social: {
    twitter: 'leeerob',
  },
}
```

## Search Engine Optimization

Most Gatsby examples use `react-helmet` to assist with adding `meta` tags for proper SEO. With Next.js, we recommend using [`next/head`](/docs/api-reference/next/head) to add `meta` tags to your `<head />` element. For example, here's part of an SEO component with Gatsby:

```js
// src/components/seo.js

import { Helmet } from 'react-helmet'

return (
  <Helmet
    title={title}
    titleTemplate={siteTitle ? `%s | ${siteTitle}` : null}
    meta={[
      {
        name: `description`,
        content: metaDescription,
      },
      {
        property: `og:title`,
        content: title,
      },
      {
        property: `og:description`,
        content: metaDescription,
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
        content: metaDescription,
      },
    ]}
  />
)
```

And here's the same example using Next.js, including reading from a site config file.

```js
// src/components/seo.js

import Head from 'next/head'
import config from '../config'

const SEO = ({ description, title }) => {
  const metaDescription = description || config.description
  const siteTitle = config.title

  return (
    <Head>
      <title>{`${title} | ${siteTitle}`}</title>
      <meta name="robots" content="follow, index" />
      <meta content={metaDescription} name="description" />
      <meta property="og:type" content="website" />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={metaDescription} />
      <meta property="og:site_name" content={siteTitle} />
      <meta property="twitter:card" content="summary" />
      <meta property="twitter:creator" content={config.social.twitter} />
      <meta property="twitter:title" content={title} />
      <meta property="twitter:description" content={metaDescription} />
    </Head>
  )
}

export default SEO
```

## Conclusion

React frameworks share many core pieces and make it easy to transition between each other. While the APIs and components may vary, the underlying ideas and implementation share similar roots and provide an easy path for migration. To view an example converting a Gatsby project to Next.js, review this [pull request](https://github.com/leerob/gatsby-to-nextjs/pull/1).
