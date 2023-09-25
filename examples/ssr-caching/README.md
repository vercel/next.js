# Server-Side Rendering Caching Headers

This example uses [`stale-while-revalidate`](https://web.dev/stale-while-revalidate/) [cache-control headers](https://developer.mozilla.org/docs/Web/HTTP/Headers/Cache-Control) in combination with `getServerSideProps` for server-rendering.

`pages/index.tsx` uses `getServerSideProps` to forward the request header to the React component, as well as setting a response header. This `cache-control` header uses `stale-while-revalidate` to cache the server response.

`pages/index.tsx` is considered fresh for ten seconds (`s-maxage=10`). If a request is repeated within the next 10 seconds, the previously cached value will still be fresh. If the request is repeated before 59 seconds, the cached value will be stale but still render (`stale-while-revalidate=59`).

In the background, a revalidation request will be made to populate the cache with a fresh value. If you refresh the page, you will see the new value shown.

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
