---
description: Learn how to use @next/mdx in your Next.js project.
---

# Using MDX with Next.js

MDX is a superset of markdown that lets you write JSX directly in your markdown files. It is a powerful way to add dynamic interactivity, and embed components within your content, helping you to bring your pages to life.

Next.js supports MDX through a number of different means, this page will outline some of the ways you can begin integrating MDX into your Next.js project.

## Why use MDX?

Authoring in markdown is an intuitive way to write content, its terse syntax, once adopted, can enable you to write content that is both readable and maintainable. Because you can use `HTML` elements in your markdown, you can also get creative when styling your markdown pages.

However, because markdown is essentially static content, you can't create _dynamic_ content based on user interactivity. Where MDX shines is in its ability to let you create and use your React components directly in the markup. This opens up a wide range of possibilities when composing your sites pages with interactivity in mind.

## MDX Plugins

Internally MDX uses remark and rehype. Remark is a markdown processor powered by a plugins ecosystem. This plugin ecosystem lets you parse code, transform `HTML` elements, change syntax, extract frontmatter, and more.

Rehype is an `HTML` processor, also powered by a plugin ecosystem. Similar to remark, these plugins let you manipulate, sanitize, compile and configure all types of data, elements and content.

To use a plugin from either remark or rehype, you will need to add it to the MDX packages config.

## `@next/mdx`

The `@next/mdx` package is configured in the `next.config.js` file at your projects root. **It sources data from local files**, allowing you to create pages with a `.mdx` extension, directly in your `/pages` directory.

### Setup `@next/mdx` in Next.js

The following steps outline how to setup `@next/mdx` in your Next.js project:

1. Install the required packages:

   ```bash
     npm install @next/mdx @mdx-js/loader
   ```

2. Require the package and configure to support top level `.mdx` pages. The following adds the `options` object key allowing you to pass in any plugins:

   ```js
     // next.config.mjs

    import nextMdx from '@next/mdx'
    import remarkFrontmatter from 'remark-frontmatter'

    const withMDX = nextMdx({
      extension: /\.mdx?$/,
      options: {
        remarkPlugins: [],
        rehypePlugins: []
        // If you use `MDXProvider`, uncomment the following line.
        // providerImportSource: "@mdx-js/react",
      }
    })

    export default withMDX({
      // Append the default value with md extensions
      pageExtensions: ['ts', 'tsx', 'js', 'jsx', 'md', 'mdx']
    })

   ```

3. Create a new MDX page within the `/pages` directory:

   ```bash
     - /pages
       - my-mdx-page.mdx
     - package.json
   ```

## Using Components, Layouts and Custom Elements

You can now import a React component directly inside your MDX page:

```md
import { MyComponent } from 'my-components'

# My MDX page

This is a list in markdown:

- One
- Two
- Three

Checkout my React component:

<MyComponent/>
```

### Frontmatter

Frontmatter is a YAML like key/value pairing that can be used to store data about a page. `@next/mdx` does **not** support frontmatter by default, though there are many solutions for adding frontmatter to your MDX content, such as [gray-matter](https://github.com/jonschlinkert/gray-matter) and [remark-frontmatter](https://github.com/remarkjs/remark-frontmatter). 

You can use them in two contexts:
- for getting the list of all pages
- for compiling a `.mdx` page



#### List all mdx pages
The common use case is to pass the list of all pages to `getStaticProps`. For example to dispaly blog posts with title, date and author on home page. To get this data without compiling MDX page (which might be slow for a big number of pages), you can use `gray-matter`.


Example from [blog-starter-typescript](https://github.com/vercel/next.js/blob/canary/examples/blog-starter-typescript/lib/api.ts):

```typescript
import matter from 'gray-matter'

...

export function getPostBySlug (slug: string, fields: string[] = []) {
  const realSlug = slug.replace(/\.mdx$/, '')
  const fullPath = join(postsDirectory, `${realSlug}.mdx`)
  const fileContents = fs.readFileSync(fullPath, 'utf8')
  const fileMatter = matter(fileContents)
  const { data, content } = fileMatter

  type Items = {
    [key: string]: string
  }

  const items: Items = {}

  // Ensure only the minimal needed data is exposed
  fields.forEach(field => {
    if (field === 'slug') {
      items[field] = realSlug
    }
    if (field === 'content') {
      items[field] = content
    }

    if (typeof data[field] !== 'undefined') {
      items[field] = data[field]
    }
  })

  return items
}

```



#### Compile MDX page
In order to compile MDX page with `@next/mdx` and handle `frontmatter` data we need to configure two plugins:
- [remark-frontmatter](https://github.com/remarkjs/remark-frontmatter)
- [remark-mdx-frontmatter](https://github.com/remcohaszing/remark-mdx-frontmatter)

```javascript
// next.config.mjs

import nextMdx from '@next/mdx'
import remarkFrontmatter from 'remark-frontmatter'
import { remarkMdxFrontmatter } from 'remark-mdx-frontmatter'

const withMDX = nextMdx({
  extension: /\.mdx?$/,
  options: {
    remarkPlugins: [
      remarkFrontmatter,
      [remarkMdxFrontmatter, { name: 'meta' }]
    ],
    rehypePlugins: []
  }
})

export default withMDX({
  pageExtensions: ['ts', 'tsx', 'js', 'jsx', 'md', 'mdx']
})

```

With this configuration `frontmatter` data are extracted to variable passed to `name` option of `remarkMdxFrontmatter` plugin (_meta_ in our case) and can be easily accessed from _inside_ a MDX page. It might be super handy to pass the entire object to Layout component in the next section.

```md
---
title: 'My MDX page'
author: 'John Doe'
---

# Page tile: {meta.title}

<Author name={meta.author} />
```

### Layouts

To add a layout to your MDX page, create a new component and import it into the MDX page. Then you can wrap the MDX page with your layout component.

```
layout.js

import Meta from './meta'
import Header from './header'
import Footer from './footer'

const Layout = (props) => {
  return (
    <>
      <Meta title={props.title} />
      <Header>{props.title}</Header>
      <Author name={props.author}
      <main>{props.children}</main>
      <Footer />
    </>
  )
}

export default Layout


```

With `frontmatter` based on the above configuration:
```md
---
title: 'My MDX page'
author: 'John Doe'
---

import Layout from './layout'

...

export default ({ children }) => <Layout {...meta}>{children}</Layout>
```

Without `frontmatter`:
```md
import Layout from './layout'

export const meta = {
  title: 'My MDX page'
  author: 'John Doe'
}

...

export default ({ children }) => <Layout {...meta}>{children}</Layout>
```

### Custom Elements

One of the pleasant aspects of using markdown, is that it maps to native `HTML` elements, making writing fast, and intuitive:

```md
# H1 heading

## H2 heading

This is a list in markdown:

- One
- Two
- Three
```

The above generates the following `HTML`:

```html
<h1>H1 heading</h1>

<h2>H2 heading</h2>

<p>This is a list in markdown:</p>

<ul>
  <li>One</li>
  <li>Two</li>
  <li>Three</li>
</ul>
```

When you want to style your own elements to give a custom feel to your website or application, you can pass in shortcodes. These are your own custom components that map to `HTML` elements. To do this you use the `MDXProvider` and pass a components object as a prop. Each object key in the components object maps to a `HTML` element name.

To enable you need to specify `providerImportSource: "@mdx-js/react"` in `next.config.js`.

```js
// next.config.js

const withMDX = require('@next/mdx')({
  // ...
  options: {
    providerImportSource: '@mdx-js/react',
  },
})
```

Then setup the provider in your page

```jsx
// pages/index.js

import { MDXProvider } from '@mdx-js/react'
import Image from 'next/image'
import { Heading, InlineCode, Pre, Table, Text } from 'my-components'

const ResponsiveImage = (props) => (
  <Image alt={props.alt} layout="responsive" {...props} />
)

const components = {
  img: ResponsiveImage,
  h1: Heading.H1,
  h2: Heading.H2,
  p: Text,
  pre: Pre,
  code: InlineCode,
}

export default function Post(props) {
  return (
    <MDXProvider components={components}>
      <main {...props} />
    </MDXProvider>
  )
}
```

If you use it across the site you may want to add the provider to `_app.js` so all MDX pages pick up the custom element config.

## Helpful Links

- [MDX](https://mdxjs.com)
- [`@next/mdx`](https://www.npmjs.com/package/@next/mdx)
- [remark](https://github.com/remarkjs/remark)
- [rehype](https://github.com/rehypejs/rehype)
