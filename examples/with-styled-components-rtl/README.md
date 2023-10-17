# Example with styled-components RTL

This example shows how to use nextjs with right to left (RTL) styles using styled-components.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) or preview live with [StackBlitz](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/with-styled-components-rtl)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-styled-components-rtl&project-name=with-styled-components-rtl&repository-name=with-styled-components-rtl)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-styled-components-rtl with-styled-components-rtl-app
```

```bash
yarn create next-app --example with-styled-components-rtl with-styled-components-rtl-app
```

```bash
pnpm create next-app --example with-styled-components-rtl with-styled-components-rtl-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

## Notes

Right to left allows to "flip" every element in your site to fit the needs of the cultures that are read from right to left (like arabic for example).

This example shows how to enable right to left styles using `styled-components`.

The good news, is there is no need of doing it manually anymore. `stylis-plugin-rtl` makes the transformation automatic.

From `pages/index.js` you can see, styles are `text-align: left;`, but what is actually applied is `text-align: right;`.
