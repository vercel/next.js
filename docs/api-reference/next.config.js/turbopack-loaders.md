---
description: Configure Next.js with Turbopack to load Webpack loaders
---

# Turbopack Loaders (`next --turbo` only)

Currently, Turbopack supports a subset of Webpack's loader API, allowing you to use some Webpack loaders to transform code in Turbopack.

> **Warning**: This feature is experimental and will only work with `next --turbo`

To configure loaders, add the names of the loaders you've installed and any options in `next.config.js`:

```js
module.exports = {
  experimental: {
    turbopackLoaders: {
      '.mdx': [
        {
          loader: '@mdx-js/loader',
          options: {
            format: 'mdx',
          },
        },
      ],
      '.foo': 'my-foo-loader',
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

For more information and guidance for how to migrate your app to Turbopack from Webpack, see [Turbopack's documentation on Webpack compatibility](https://turbo.build/pack/docs/migrating-from-webpack).
