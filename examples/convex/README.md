# Convex

This example demonstrates the Convex global state management framework.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/convex&project-name=convex&repository-name=convex)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-convex with-convex-app
# or
yarn create next-app --example with-convex with-convex-app
# or
pnpm create next-app --example with-convex with-convex-app
```

Log in to Convex,

```bash
npx convex login
```

initialize a new Convex project,

```bash
npx convex init
```

and push the Convex functions for this project.

```bash
npx convex push
```

Now you can run your code locally with a Convex backend with

```bash
npm run dev
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
