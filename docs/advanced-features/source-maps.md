---
description: Enables browser source map generation during the production build.
---

# Source Maps

Source Maps are enabled by default during development. During production builds, they are disabled as generating source maps can significantly increase build times and memory usage while being generated.

Next.js provides a configuration flag you can use to enable browser source map generation during the production build:

```js
// next.config.js
module.exports = {
  productionBrowserSourceMaps: true,
}
```

When the `productionBrowserSourceMaps` option is enabled, the source maps will be output in the same directory as the JavaScript files. Next.js will automatically serve these files when requested.

## Caveats

- Adding source maps can increase `next build` time
- Increases memory usage during `next build`
