---
description: Learn how to use next-mdx-remote in your Next.js project.
---

# `next-mdx-remote`

The `next-mdx-remote` package does **not** require a global configuration, instead it can be loaded on a page by page basis. It uses the Next.js [data fetching](/docs/basic-features/data-fetching.md) techniques to source data from anywhere, this includes local files, external APIs or databases.

## Setup `next-mdx-remote` in Next.js

The following steps outline how to setup a static page with MDX content using `next-mdx-remote` in your Next.js project:

1. Install the required packages:

   ```terminal
     npm i next-mdx-remote gray-matter

     #or

     yarn add next-mdx-remote gray-matter
   ```

2. Inside a page component that will be [statically rendered](/docs/basic-features/data-fetching#getstaticprops-static-generation), import the `serialize` function and `MDXRemote` component from `next-mdx-remote`. The following adds the `mdxOptions` object key to the `serialize` function, allowing you to pass in any plugins:

   ```jsx
   import { serialize } from 'next-mdx-remote/serialize'
   import { MDXRemote } from 'next-mdx-remote'

   export default function Post({ source }) {
     return (
       <div className="wrapper">
         <MDXRemote {...source} />
       </div>
     )
   }

   export async function getStaticProps() {
     // MDX text - can be from a local file, database, anywhere
     const source = 'Some **mdx** text, with a component <Heading />'
     const mdxSource = await serialize(source, {
       mdxOptions: {
         remarkPlugins: [],
         rehypePlugins: [],
       },
     })
     return { props: { source: mdxSource } }
   }
   ```

## Using frontmatter, and custom elements

To access and use frontmatter in your MDX page the `gray-matter` package can be used to parse the data.

Frontmatter is a yaml like key, value pairing that can be used to store data about a page.

```md
---
title: My MDX page
author: Rich Haines
---

# My MDX Page
```

To parse this data and make it available in your page, import the `gray-matter` package and deconstruct the `content` and `data`. The `content` is the content of the MDX page as a string, and the `data` is the frontmatter. This is then passed to the `serialize` function via the `scope` object and available as a prop on the page component.

Note that if you are pulling in the MDX content from the file system, then you would use the `content` destructured from `gray-matter`, and this would be passed into the `serialize` function.

The following example shows how to parse frontmatter data, add custom elements as shortcodes, and get the MDX content from the file system:

```jsx
import { serialize } from 'next-mdx-remote/serialize'
import { MDXRemote } from 'next-mdx-remote'
import matter from 'gray-matter'
import Heading from 'my-components'
import fs from 'fs'

const components = {
  h1: Heading.H1,
}

export default function Post({ source, frontmatter }) {
  return (
    <div className="wrapper">
      <h1>{frontmatter.title}</h1>
      <MDXRemote {...source} components={components} />
    </div>
  )
}

export async function getStaticProps({ params }) {
  const postFilePath = path.join(POSTS_PATH, `${params.slug}.mdx`)
  const source = fs.readFileSync(postFilePath)

  const { content, data } = matter(source)

  const mdxSource = await serialize(source, {
    mdxOptions: {
      remarkPlugins: [],
      rehypePlugins: [],
    },
    scope: data,
  })
  return {
    props: {
      source: mdxSource,
      frontMatter: data,
    },
  }
}

export const getStaticPaths = async () => {
  const paths = postFilePaths
    // Remove file extensions for page paths
    .map((path) => path.replace(/\.mdx?$/, ''))
    // Map the path into the static paths object required by Next.js
    .map((slug) => ({ params: { slug } }))

  return {
    paths,
    fallback: false,
  }
}
```

## Caveats

With `next-mdx-remote` you are unable to directly import components into your MDX file. To work around this, and supply your MDX file with custom components, you can pass them in as shortcodes the same way you would define the custom `HTML` elements mapping:

```js
  // Other imports...
  import MyCustomComponent from 'my-components'
  import MyCustomComponentWithChildren from 'my-components'

 const components = {
    h1: Heading.H1
    MyCustomComponent,
    MyCustomComponentWithChildren: (props) => <MyCustomComponentWithChildren>{props.children}</MyCustomComponentWithChildren>
  }

  export default function Post({ source, frontmatter }) {
    return (
      <div className="wrapper">
      <h1>{frontmatter.title}</h1>
        <MDXRemote {...source} components={components} />
      </div>
    )
  }

  // Data fetching functions...
```

These two components are now available in your MDX file without needed to import:

```md
---
title: My MDX page
author: Rich Haines
---

# My MDX page

<MyCustomComponent/>

<MyCustomComponentWithChildren>

Some markdown content here

</MyCustomComponentWithChildren>
```

## Learn more

The [`next-mdx-remote`](https://github.com/hashicorp/next-mdx-remote) repository contains more information on how to setup and configure MDX with Next.js.
