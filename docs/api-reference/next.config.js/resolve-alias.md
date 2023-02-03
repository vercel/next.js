---
description: Configure Next.js with Turbopack to alias module resolution
---

# Resolve Alias (`next --turbo` only)

Through `next.config.js`, Turbopack can be configured to modify module resolution through aliases, similar to Webpack's [`resolve.alias`](https://Webpack.js.org/configuration/resolve/#resolvealias) configuration.

> **Warning**: This feature is experimental and will only work with `next --turbo`

To configure resolve aliases, map imported patterns to their new destination in `next.config.js`:

```js
module.exports = {
  experimental: {
    resolveAlias: {
      foo: 'bar',
      baz: { browser: 'baz/browser' },
    },
  },
}
```

This aliases imports of the `foo` package to the `bar` package. In other words, `import 'foo'` will result in loading the `bar` module instead of `foo`.

Turbopack also supports conditional aliasing through this field, similar to Node.js's [conditional exports](https://nodejs.org/docs/latest-v18.x/api/packages.html#conditional-exports). At the moment only the `browser` condition is supported. In the case above, imports of the `baz` module will be aliased to `baz/browser` when Turbopack targets browser environments.

For more information and guidance for how to migrate your app to Turbopack from Webpack, see [Turbopack's documentation on Webpack compatibility](https://turbo.build/pack/docs/migrating-from-webpack).
