# Server-Side Rendering Caching Headers

By default, Next.js will cache as much as possible to improve performance and reduce cost. This means routes are statically rendered and data requests are cached unless you opt out.

This example uses the [`revalidate`](https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config#revalidate) route segment config option to override the route segment defaults.

Calling the Index Page (`/`) within the specified timeframe (e.g., 10 seconds) will return the cached Page ([Full Route Cache](https://nextjs.org/docs/app/building-your-application/caching#full-route-cache) in this example).

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) or preview live with [StackBlitz](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/ssr-caching)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/ssr-caching&project-name=ssr-caching&repository-name=ssr-caching)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example ssr-caching ssr-caching-app
```

```bash
yarn create next-app --example ssr-caching ssr-caching-app
```

```bash
pnpm create next-app --example ssr-caching ssr-caching-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
