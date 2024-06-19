# Next.js + MDX

Use [MDX](https://github.com/mdx-js/mdx) with [Next.js](https://github.com/vercel/next.js)

## Installation

For usage with the `app` directory see the section below.

```
npm install @next/mdx @mdx-js/loader @mdx-js/react
```

or

```
yarn add @next/mdx @mdx-js/loader @mdx-js/react
```

## Usage

Create a `next.config.mjs` in your project

```js
// next.config.mjs
import nextMDX from '@next/mdx'

const withMDX = nextMDX()
export default withMDX()
```

Optionally you can provide [MDX plugins](https://mdxjs.com/advanced/plugins#plugins):

```js
// next.config.mjs
import nextMDX from '@next/mdx'

const withMDX = nextMDX({
  options: {
    remarkPlugins: [],
    rehypePlugins: [],
  },
})
export default withMDX()
```

Optionally you can add your custom Next.js configuration as parameter

```js
// next.config.mjs
import nextMDX from '@next/mdx'

const withMDX = nextMDX()
export default withMDX({
  webpack(config, options) {
    return config
  },
})
```

By default MDX will only match and compile MDX files with the `.mdx` extension.
However, it can also be optionally configured to handle markdown files with the `.md` extension, as shown below:

```js
// next.config.mjs
import nextMDX from '@next/mdx'

const withMDX = nextMDX({
  extension: /\.(md|mdx)$/,
})
export default withMDX()
```

In addition, MDX can be customized with compiler options, see the [mdx documentation](https://mdxjs.com/packages/mdx/#compilefile-options) for details on supported options.

## Top level .mdx pages

Define the `pageExtensions` option to have Next.js handle `.md` and `.mdx` files in the `pages` directory as pages:

```js
// next.config.mjs
import nextMDX from '@next/mdx'

const withMDX = nextMDX({
  extension: /\.mdx?$/,
})
export default withMDX({
  pageExtensions: ['js', 'jsx', 'ts', 'tsx', 'md', 'mdx'],
})
```

## TypeScript

Follow [this guide](https://mdxjs.com/advanced/typescript) from the MDX docs.

---

# App directory

## Installation

For usage with the `app` directory see below.

```
npm install @next/mdx
```

or

```
yarn add @next/mdx
```

## Usage

Create a `mdx-components.js` file at the root of your project with the following contents:

```js
// This file is required to use @next/mdx in the `app` directory.
export function useMDXComponents(components) {
  return components
  // Allows customizing built-in components, e.g. to add styling.
  // return {
  //   h1: ({ children }) => <h1 style={{ fontSize: "100px" }}>{children}</h1>,
  //   ...components,
  // }
}
```

Create a `next.config.mjs` in your project

```js
// next.config.mjs
import nextMDX from '@next/mdx'

const withMDX = nextMDX({
  // Optionally provide remark and rehype plugins
  options: {
    remarkPlugins: [],
    rehypePlugins: [],
    // If you use `MDXProvider`, uncomment the following line.
    // providerImportSource: "@mdx-js/react",
  },
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Configure pageExtensions to include md and mdx
  pageExtensions: ['ts', 'tsx', 'js', 'jsx', 'md', 'mdx'],
  // Optionally, add any other Next.js config below
  reactStrictMode: true,
}

// Merge MDX config with Next.js config
export default withMDX(nextConfig)
```

## TypeScript

Follow [this guide](https://mdxjs.com/advanced/typescript) from the MDX docs.
