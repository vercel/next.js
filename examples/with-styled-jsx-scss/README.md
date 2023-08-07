# With styled-jsx SASS / SCSS

Next.js ships with [styled-jsx](https://github.com/vercel/styled-jsx) allowing you
to write scope styled components with full css support. This is important for
the modularity and code size of your bundles and also for the learning curve of the framework. If you know css you can write styled-jsx right away.

This example shows how to configure styled-jsx to use external plugins to modify the output. Using this you can use PostCSS, SASS (SCSS), LESS, or any other pre-processor with styled-jsx. You can define plugins in `.babelrc`. This example shows how to implement the SASS plugin.

More details about how plugins work can be found in the [styled-jsx readme](https://github.com/vercel/styled-jsx#css-preprocessing-via-plugins)

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) or preview live with [StackBlitz](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/with-styled-jsx-scss)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-styled-jsx-scss&project-name=with-styled-jsx-scss&repository-name=with-styled-jsx-scss)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-styled-jsx-scss with-styled-jsx-scss-app
```

```bash
yarn create next-app --example with-styled-jsx-scss with-styled-jsx-scss-app
```

```bash
pnpm create next-app --example with-styled-jsx-scss with-styled-jsx-scss-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
