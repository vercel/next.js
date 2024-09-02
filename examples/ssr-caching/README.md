# Server-Side Rendering Caching Headers

By default, Next.js will cache as much as possible to improve performance and reduce cost. This means routes are statically rendered and data requests are cached unless you opt out.

This example uses [`next.revalidate`](https://nextjs.org/docs/app/building-your-application/caching) option of fetch to set the cache lifetime of a resource (in seconds).

The first time a fetch request with revalidate is called, the data will be fetched from the external data source and stored in the Data Cache.

Any requests that are called within the specified timeframe (e.g. 60-seconds) will return the cached data.

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
