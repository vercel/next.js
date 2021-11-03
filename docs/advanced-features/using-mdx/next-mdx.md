---
description: Learn how to use @next/mdx in your Next.js project.
---

# `@next/mdx`

The `@next/mdx` package is configured in the `next.config.js` file at your projects root. **It sources data from local files**, allowing you to create pages with a `.mdx` extension, directly in your `/pages` directory.

### Setup `@next/mdx` in Next.js

The following steps outline how to setup `@next/mdx` in your Next.js project:

1. Install the required packages:

   ```terminal
     npm install @next/mdx @mdx-js/loader

     #or

     yarn add @next/mdx @mdx-js/loader
   ```

2. Require the package and configure to support top level `.mdx` pages. The following adds the `options` object key allowing you to pass in any plugins:

   ```js
   // next.config.js

   const withMDX = require('@next/mdx')({
     extension: /\.mdx?$/,
     options: {
       remarkPlugins: [],
       rehypePlugins: [],
     },
   })
   module.exports = withMDX({
     pageExtensions: ['js', 'jsx', 'md', 'mdx'],
   })
   ```

3. Create a new MDX page within the `/pages` directory:

   ```bash
     - /pages
       - my-mdx-page.mdx
     - package.json
   ```

## Using components, layouts and custom elements

You can now import a React component directly inside your MDX page. Note that `@next/mdx` does **not** support frontmatter (frontmatter is a yaml like key, value pairing that can be used to store data about a page), instead, you can export data from within the `.mdx` file:

```md
import { CoolComponent } from 'my-components'

export const metaData = {
author: 'Rich Haines'
}

# My MDX page

This is a list in markdown:

- One
- Two
- Three

Checkout my React component:

<CoolComponent/>
```

### Layouts

To add a layout to your MDX page, create a new component and import it into the MDX page. Then you can wrap the MDx page with your layout component:

```md
import { CoolComponent, CoolLayoutComponent } from 'my-components'

export const meta = {
author: 'Rich Haines'
}

# My MDX page with a layout

This is a list in markdown:

- One
- Two
- Three

Checkout my React component:

<CoolComponent/>

export default = ({ children }) => <CoolLayoutComponent meta={meta}>{children}</CoolLayoutComponent>
```

### Custom elements

One of the pleasant aspects of using markdown, is that it maps to native `HTML` elements, making writing fast, and intuitive:

```md
# H1 heading

## H2 heading

This is a list in markdown:

- One
- Two
- Three
```

When you want to style your own elements to give a custom feel to your website or application, you can pass in shortcodes. These are your own custom components that map to `HTML` elements. To do this you use the `MDXProvider` and pass a components object as a prop. Each object key in the components object maps to a `HTML` element name.

```jsx
// pages/index.js

import { MDXProvider } from '@mdx-js/react'
import Image from 'next/image'
import { Heading, Text, Pre, Code, Table } from 'my-components'

const ResponsiveImage = (props) => (
  <Image alt={props.alt} layout="responsive" {...props} />
)

const components = {
  img: ResponsiveImage,
  h1: Heading.H1,
  h2: Heading.H2,
  p: Text,
  code: Pre,
  inlineCode: Code,
}

export default function Post(props) {
  return (
    <MDXProvider components={components}>
      <main {...props} />
    </MDXProvider>
  )
}
```
