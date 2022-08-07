# Custom [Polka](https://github.com/lukeed/polka) Server example

Most of the time the default Next.js server will be enough but there are times you'll want to run your own server to integrate into an existing application. Next.js provides [a custom server api](https://nextjs.org/docs/advanced-features/custom-server).

Because the Next.js server is a Node.js module you can combine it with any other part of the Node.js ecosystem. In this case we are using Polka.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) or preview live with [StackBlitz](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/custom-server-polka)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/custom-server-polka)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example custom-server-polka custom-server-polka-app
```

```bash
yarn create next-app --example custom-server-polka custom-server-polka-app
```

```bash
pnpm create next-app --example custom-server-polka custom-server-polka-app
```
