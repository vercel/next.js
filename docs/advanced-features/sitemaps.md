---
description: Learn how to add a sitemap to your Next.js project, along with a robots.txt file for optimal SEO.
---

# Sitemaps

To improve your Search Engine Optimization (SEO), you might want to add a sitemap or `robots.txt` file to your Next.js site.

A **sitemap** defines the relationship between pages of your site. Search engines utilize
this file to more accurately index your site. You can also provide additional information
such as last updated time, how frequently the page changes, and more.

A **robots.txt** file tells search engines which pages or files the crawler can or can't request from your site.

## Static Sitemaps

If your site does not update frequently, you might currently have a static sitemap.
This is a basic `.xml` file defining the content of your site. Here's a simple example:

```xml
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
      <loc>https://nextjs.org</loc>
  </url>
  <url>
      <loc>https://nextjs.org/docs</loc>
  </url>
</urlset>
```

## Dynamic Sitemaps

If your site frequently changes, you should dynamically create a sitemap. First, let's explore an example where your content is based on [file-system routing](/docs/routing/introduction.md) (e.g., contained inside the `/pages` directory).

This example is using [globby](https://github.com/sindresorhus/globby) to fetch our list of routes.

```bash
npm install globby --save-dev
```

Next, we can create a Node script at `scripts/generate-sitemap.mjs`.
This file will dynamically build a sitemap based on your `/pages` directory.

```js
import { writeFileSync } from 'fs'
import { globby } from 'globby'

async function generate() {
  const pages = await globby([
    'pages/*.js', // Include all pages
    '!pages/_*.js', // Exclude _app or _document
    '!pages/api', // Exclude API Routes
    '!pages/404.js', // Exclude 404
  ])

  const sitemap = `
    <?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        ${pages
          .map((page) => {
            const path = page.replace('pages', '').replace('.js', '')
            const route = path === '/index' ? '' : path

            return `
              <url>
                  <loc>${`https://nextjs.org${route}`}</loc>
              </url>
            `
          })
          .join('')}
    </urlset>
    `

  writeFileSync('public/sitemap.xml', sitemap)
}

generate()
```

> **Note:** This Node.js script is using [ES Modules](https://nodejs.org/api/esm.html), denoted by the `.mjs` extension. You could also write this script with [CommonJS](https://nodejs.org/api/modules.html#modules_modules_commonjs_modules) if you prefer.

Finally, add `postbuild` script in your `package.json` to run this script after `next build` completes.
Your generated sitemap file gets created at `public/sitemap.xml`, which is then served as a [static file](/docs/basic-features/static-file-serving.md) at the root of your site.

```json
{
  "scripts": {
    "build": "next build",
    "postbuild": "node ./scripts/generate-sitemap.mjs",
    "dev": "next dev",
    "start": "next start",
    "lint": "next lint"
  }
}
```

## External Content

If you have externally hosted data (e.g., a CMS), you'll need to make an API request
before you can create your sitemap. This implementation will vary depending on your data source,
but the idea is similar. To demonstrate, I've created an example using placeholder data.

First, create a new file at `pages/sitemap.xml.js`.

```js
import React from 'react'

class Sitemap extends React.Component {
  static async getInitialProps({ res }) {
    const request = await fetch(EXTERNAL_DATA_URL)
    const posts = await request.json()

    res.setHeader('Content-Type', 'text/xml')
    res.write(createSitemap(posts))
    res.end()
  }
}

export default Sitemap
```

When the route `/sitemap.xml` is initially loaded, we will fetch posts from an external data source
and then write an XML file as the response.

```js
import React from 'react'

const EXTERNAL_DATA_URL = 'https://jsonplaceholder.typicode.com/posts'

const createSitemap = (posts) => `<?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        ${posts
          .map(({ id }) => {
            return `
                <url>
                    <loc>${`${EXTERNAL_DATA_URL}/${id}`}</loc>
                </url>
            `
          })
          .join('')}
    </urlset>
    `

class Sitemap extends React.Component {
  static async getInitialProps({ res }) {
    const request = await fetch(EXTERNAL_DATA_URL)
    const posts = await request.json()

    res.setHeader('Content-Type', 'text/xml')
    res.write(createSitemap(posts))
    res.end()
  }
}

export default Sitemap
```

Here's a condensed example of the output.

```xml
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
      <loc>https://jsonplaceholder.typicode.com/posts/1</loc>
  </url>
  <url>
      <loc>https://jsonplaceholder.typicode.com/posts/2</loc>
  </url>
</urlset>
```

## robots.txt

Finally, we can create a static file at `public/robots.txt` to define which
files can be crawled and where the sitemap is located.

```bash
User-agent: *
Sitemap: https://nextjs.org/sitemap.xml
```
