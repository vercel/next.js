---
title: How to configure Babel in Next.js
nav_title: Babel
description: Extend the babel preset added by Next.js with your own configs.
---

<details>
  <summary>Examples</summary>

- [Customizing babel configuration](https://github.com/vercel/next.js/tree/canary/examples/with-custom-babel-config)

</details>

Next.js includes the `next/babel` preset to your app, which includes everything needed to compile React applications and server-side code. But if you want to extend the default Babel configs, it's also possible.

## Adding Presets and Plugins

To start, you only need to define a `.babelrc` file (or `babel.config.js`) in the root directory of your project. If such a file is found, it will be considered as the _source of truth_, and therefore it needs to define what Next.js needs as well, which is the `next/babel` preset.

Here's an example `.babelrc` file:

```json filename=".babelrc"
{
  "presets": ["next/babel"],
  "plugins": []
}
```

You can [take a look at this file](https://github.com/vercel/next.js/blob/canary/packages/next/src/build/babel/preset.ts) to learn about the presets included by `next/babel`.

To add presets/plugins **without configuring them**, you can do it this way:

```json filename=".babelrc"
{
  "presets": ["next/babel"],
  "plugins": ["@babel/plugin-proposal-do-expressions"]
}
```

## Customizing Presets and Plugins

To add presets/plugins **with custom configuration**, do it on the `next/babel` preset like so:

```json filename=".babelrc"
{
  "presets": [
    [
      "next/babel",
      {
        "preset-env": {},
        "transform-runtime": {},
        "styled-jsx": {},
        "class-properties": {}
      }
    ]
  ],
  "plugins": []
}
```

To learn more about the available options for each config, visit babel's [documentation](https://babeljs.io/docs/) site.

> **Good to know**:
>
> - Next.js uses the [**current** Node.js version](https://github.com/nodejs/release#release-schedule) for server-side compilations.
> - The `modules` option on `"preset-env"` should be kept to `false`, otherwise webpack code splitting is turned off.
