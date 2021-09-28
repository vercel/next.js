# Server-Side Rendering Caching Headers

This example uses [`stale-while-revalidate`](https://web.dev/stale-while-revalidate/) [cache-control headers](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control) in combination with `getServerSideProps` for server-rendering.

`pages/index.js` uses `getServerSideProps` to forward the request header to the React component, as well as setting a response header. This `cache-control` header uses `stale-while-revalidate` to cache the server response.

`pages/index.js` is considered fresh for ten seconds (`s-maxage=10`). If a request is repeated within the next 10 seconds, the previously cached value will still be fresh. If the request is repeated before 59 seconds, the cached value will be stale but still render (`stale-while-revalidate=59`).

In the background, a revalidation request will be made to populate the cache with a fresh value. If you refresh the page, you will see the new value shown.

## Preview

Preview the example live on [StackBlitz](http://stackblitz.com/):

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/ssr-caching)

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/ssr-caching&project-name=ssr-caching&repository-name=ssr-caching)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example ssr-caching ssr-caching-app
# or
yarn create next-app --example ssr-caching ssr-caching-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
