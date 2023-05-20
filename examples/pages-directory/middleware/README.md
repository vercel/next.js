# Middleware

This example shows how to use [Middleware in Next.js](https://nextjs.org/docs/advanced-features/middleware) to run code before a request is completed.

The index page ([`pages/index.tsx`](pages/index.tsx)) has a list of links to pages with `redirect`, `rewrite`, or normal behavior.

On the Middleware file ([`middleware.ts`](middleware.ts)) the routes are already being filtered by defining a `matcher` on the exported config. If you want the Middleware to run for every request, you can remove the `matcher`.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/middleware&project-name=middleware&repository-name=middleware)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example middleware middleware-app
```

```bash
yarn create next-app --example middleware middleware-app
```

```bash
pnpm create next-app --example middleware middleware-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
