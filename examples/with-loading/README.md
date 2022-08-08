# Example app with page loading indicator

Sometimes when switching between pages, Next.js needs to download pages(chunks) from the server before rendering the page. And it may also need to wait for the data. So while doing these tasks, the browser might be non responsive.

We can simply fix this issue by showing a loading indicator. That's what this examples shows.

It features:

- An app with two pages which uses a common [Header](./components/Header.js) component for navigation links.
- Using `next/router` to identify different router events
- Uses [nprogress](https://github.com/rstacruz/nprogress) as the loading indicator.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) or preview live with [StackBlitz](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/with-loading)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-loading&project-name=with-loading&repository-name=with-loading)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-loading with-loading-app
```

```bash
yarn create next-app --example with-loading with-loading-app
```

```bash
pnpm create next-app --example with-loading with-loading-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
