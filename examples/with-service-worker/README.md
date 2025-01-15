# Service Worker Example

This example shows how to add a simple service worker to a Next.js application. The service worker is in [`public/sw.js`](public/sw.js) and it's installed by [`pages/index.tsx`](pages/index.tsx) after the first render.

The example is based on the following blog post: [Adding a service worker into your Next.js application](https://dev.to/josedonato/adding-a-service-worker-into-your-next-js-application-1dib).

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) or preview live with [StackBlitz](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/with-service-worker)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-service-worker&project-name=with-service-worker&repository-name=with-service-worker)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-service-worker with-service-worker-app
```

```bash
yarn create next-app --example with-service-worker with-service-worker-app
```

```bash
pnpm create next-app --example with-service-worker with-service-worker-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
