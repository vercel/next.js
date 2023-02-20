# With Polyfills

Next.js supports IE11 and all modern browsers (Edge, Firefox, Chrome, Safari, Opera, et al) with no required configuration. It also adds [some polyfills](https://nextjs.org/docs/basic-features/supported-browsers-features#polyfills) by default.

If your own code or any external npm dependencies require features not supported by your target browsers, you need to add polyfills yourself.

In this case, you should add a top-level import for the specific polyfill you need in your Custom `<App>` or the individual component.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) or preview live with [StackBlitz](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/with-polyfills)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-polyfills&project-name=with-polyfills&repository-name=with-polyfills)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-polyfills with-polyfills-app
```

```bash
yarn create next-app --example with-polyfills with-polyfills-app
```

```bash
pnpm create next-app --example with-polyfills with-polyfills-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
