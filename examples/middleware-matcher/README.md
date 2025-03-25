# Middleware

This example shows how to configure your [Next.js Middleware](https://nextjs.org/docs/advanced-features/middleware) to only match specific pages.

The index page ([`pages/index.ts`](pages/index.ts)) has a list of links to dynamic pages, which will tell whether they were matched or not.

The Middleware file ([`middleware.ts`](middleware.ts)) has a special `matcher` configuration key, allowing you to fine-grained control [matched pages](https://nextjs.org/docs/advanced-features/middleware#matcher).

Please keep in mind that:

1. Middleware always runs first
1. Middleware always matches `_next` routes on server side
1. matcher must always starts with a '/'

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) or preview live with [StackBlitz](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/middleware-matcher)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/middleware-matcher&project-name=middleware-matcher&repository-name=middleware-matcher)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example middleware-matcher middleware-matcher-app
```

```bash
yarn create next-app --example middleware-matcher middleware-matcher-app
```

```bash
pnpm create next-app --example middleware-matcher middleware-matcher-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
