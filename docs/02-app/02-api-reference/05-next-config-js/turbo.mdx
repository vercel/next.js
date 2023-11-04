---
title: turbo (Experimental)
nav_title: turbo
description: Configure Next.js with Turbopack-specific options
---

{/* The content of this doc is shared between the app and pages router. You can use the `<PagesOnly>Content</PagesOnly>` component to add content that is specific to the Pages Router. Any shared content should not be wrapped in a component. */}

> **Warning**: These features are experimental and will only work with `next --turbo`.

## webpack loaders

Currently, Turbopack supports a subset of webpack's loader API, allowing you to use some webpack loaders to transform code in Turbopack.

To configure loaders, add the names of the loaders you've installed and any options in `next.config.js`, mapping file extensions to a list of loaders:

```js filename="next.config.js"
module.exports = {
  experimental: {
    turbo: {
      rules: {
        // Option format
        '*.md': [
          {
            loader: '@mdx-js/loader',
            options: {
              format: 'md',
            },
          },
        ],
        // Option-less format
        '*.mdx': ['@mdx-js/loader'],
      },
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

## Resolve Alias

Through `next.config.js`, Turbopack can be configured to modify module resolution through aliases, similar to webpack's [`resolve.alias`](https://webpack.js.org/configuration/resolve/#resolvealias) configuration.

To configure resolve aliases, map imported patterns to their new destination in `next.config.js`:

```js filename="next.config.js"
module.exports = {
  experimental: {
    turbo: {
      resolveAlias: {
        underscore: 'lodash',
        mocha: { browser: 'mocha/browser-entry.js' },
      },
    },
  },
}
```

This aliases imports of the `underscore` package to the `lodash` package. In other words, `import underscore from 'underscore'` will load the `lodash` module instead of `underscore`.

Turbopack also supports conditional aliasing through this field, similar to Node.js's [conditional exports](https://nodejs.org/docs/latest-v18.x/api/packages.html#conditional-exports). At the moment only the `browser` condition is supported. In the case above, imports of the `mocha` module will be aliased to `mocha/browser-entry.js` when Turbopack targets browser environments.

For more information and guidance for how to migrate your app to Turbopack from webpack, see [Turbopack's documentation on webpack compatibility](https://turbo.build/pack/docs/migrating-from-webpack).
