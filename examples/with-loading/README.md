# Example app with page loading indicator

Sometimes when switching between pages, Next.js needs to download pages(chunks) from the server before rendering the page. And it may also need to wait for the data. So while doing these tasks, the browser might be non responsive.

We can simply fix this issue by showing a loading indicator. That's what this examples shows.

It features:

- An app with two pages which uses a common [Header](./components/Header.js) component for navigation links.
- Using `next/router` to identify different router events
- Uses [nprogress](https://github.com/rstacruz/nprogress) as the loading indicator.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/project?template=https://github.com/vercel/next.js/tree/canary/examples/with-loading)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-loading with-loading-app
# or
yarn create next-app --example with-loading with-loading-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
