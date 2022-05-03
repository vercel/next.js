# UnoCSS

This example shows how to use [UnoCSS](https://github.com/unocss/unocss) with Next.js.

(Minimal demo)

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-unocss&project-name=with-unocss&repository-name=with-unocss)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-unocss with-unocss-app
# or
yarn create next-app --example with-unocss with-unocss-app
# or
pnpm create next-app -- --example with-unocss with-unocss-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).


## Working Configuration

- Install and use a preset manually (e.g. `@unocss/preset-uno`)
- `import 'uno.css'`
- disbale webpack build cache (for UnoCSS)

---

`next.config.js`

```js
const UnoCSS = require("@unocss/webpack").default;
const presetUno = require("@unocss/preset-uno").default;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  webpack(config, context) {
    config.plugins.push(UnoCSS({ presets: [presetUno()] }));

    if (context.buildId !== "development") {
      // * disable filesystem cache for build
      // * see: https://github.com/unocss/unocss/issues/419
      // * see: https://webpack.js.org/configuration/cache/
      config.cache = false;
    }

    return config;
  },
};

module.exports = nextConfig;
```

`_app.js`

```tsx
import "uno.css";
```

`index.tsx`

```tsx
// * somewhere
<div className='text-red'><div>
```

## Explanation

UnoCSS doesn't work well with Webpack 5's cache system for now (according to this <https://github.com/unocss/unocss/issues/419>)

The effect (with cache) is that:

- `npx next build`: first time, everything is ok
- `npx next build`: second time, all unocss style is gone
- `npx next build`: third time, `Failed to compile. no such file ./_virtual_\__uno.css`

**So just turn cache off for build.**
