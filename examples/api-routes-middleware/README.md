# API routes with middleware

Next.js ships with [API routes](https://github.com/vercel/next.js#api-routes), which provide an easy solution to build your own `API`. This example shows how to implement simple `middleware` to wrap around your `API` endpoints.

## Deploy your own

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/api-routes-middleware&project-name=api-routes-middleware&repository-name=api-routes-middleware)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example api-routes-middleware api-routes-middleware-app
```

```bash
yarn create next-app --example api-routes-middleware api-routes-middleware-app
```

```bash
pnpm create next-app --example api-routes-middleware api-routes-middleware-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
