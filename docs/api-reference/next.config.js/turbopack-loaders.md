---
description: Configure Next.js with Turbopack to load webpack loaders
---

# Turbopack Loaders (`next --turbo` only)

Currently, Turbopack supports a subset of webpack's loader API, allowing you to use some webpack loaders to transform code in Turbopack.

> **Warning**: This feature is experimental and will only work with `next --turbo`.

To configure loaders, add the names of the loaders you've installed and any options in `next.config.js`, mapping file extensions to a list of loaders:

```js
module.exports = {
  experimental: {
    turbopackLoaders: {
      '.md': [
        {
          loader: '@mdx-js/loader',
          options: {
            format: 'md',
          },
        },
      ],
      '.mdx': '@mdx-js/loader',
    },
  },
}
```

Then, given the above configuration, you can use transformed code from your app:

```js
import MyDoc from './my-doc.mdx'

export default function Home() {
  return <MyDoc />
}
```

For more information and guidance for how to migrate your app to Turbopack from webpack, see [Turbopack's documentation on webpack compatibility](https://turbo.build/pack/docs/migrating-from-webpack).
