# Statsig

This example demonstrates how to integrate [Statsig](https://www.statsig.com?ref=nextjs_statsig_example) into a Next.js app using App Router.

It utilizes the [Statsig Node SDK](https://www.npmjs.com/package/statsig-node) (server side) to generate values for the [Statsig JS SDK](https://www.npmjs.com/package/@statsig/js-client) (client side).

All client side SDK network requests are proxied to the Next.js server (/statsig-proxy/initialize and /statsig-proxy/log_event).

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/statsig&project-name=statsig&repository-name=statsig)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), [pnpm](https://pnpm.io), or [Bun](https://bun.sh/docs/cli/bunx) to bootstrap the example:

```bash
npx create-next-app --example statsig statsig-app
```

```bash
yarn create next-app --example statsig statsig-app
```

```bash
pnpm create next-app --example statsig statsig-app
```

```bash
bunx create-next-app --example statsig statsig-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
