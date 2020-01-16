---
description: Extend the PostCSS config and plugins added by Next.js with your own.
---

# Customizing PostCSS Config

<details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="https://github.com/zeit/next.js/tree/canary/examples/with-tailwindcss">Tailwind CSS Example</a></li>
  </ul>
</details>

Next.js leverages PostCSS to power its [built-in CSS support](/docs/basic-features/built-in-css-support.md) with a set of default plugins. However, you can add your own plugins to customize your application.

To start, you only need to define a `postcss.config.js` file at the top of your app.

Here's an example `postcss.config.js` file:

```js
module.exports = {
  plugins: ['tailwindcss', 'autoprefixer'],
}
```

> Next.js implement a **proprietary, string-based array format** identical to a Babel configuration. You should not use `require()` with each plugin, as the build will fail.

If your `postcss.config.js` needs to support other non-Next.js tools in the same project, you should use the interoperable object-based format instead:

```js
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

Next.js combines any custom plugins you define in your config with its default set of plugins:

- postcss-flexbugs-fixes
- postcss-preset-env
- postcss-modules
- postcss-modules-values
- postcss-modules-scope
- postcss-modules-extract-imports
- postcss-modules-local-by-default
