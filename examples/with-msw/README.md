# Mock Service Worker Example

[Mock Service Worker](https://github.com/mswjs/msw) is an API mocking library for browser and Node. It provides seamless mocking by interception of actual requests on the network level using Service Worker API. This makes your application unaware of any mocking being at place.

In this example we integrate Mock Service Worker with Next by following the next steps:

1. Define a set of [request handlers](./mocks/handlers.ts) shared between client and server.
1. Setup a [Service Worker instance](./mocks/browser.ts) that would intercept all runtime client-side requests via `setupWorker` function.
1. Setup a ["server" instance](./mocks/server.ts) to intercept any server/build time requests (e.g. the one happening in `getServerSideProps`) via `setupServer` function.

Mocking is enabled using the `NEXT_PUBLIC_API_MOCKING` environment variable. By default, mocking is enabled for both development and production. This allows you to have working preview deployments before implementing an actual API. To disable MSW for a specific environment, change the environment variable value in the file corresponding to the environment from `enabled` to `disabled`.

The service worker file will automatically be generated in `public/mockServiceWorker.js` after installing `node_modules`. If the file is not generated, you can explicitly generate it with the following command:

```bash
npx msw init public/
```

```bash
yarn msw init public/
```

```bash
pnpm msw init public/
```

More information on this setup step can be found in the MSW documentation [here](https://mswjs.io/docs/getting-started/integrate/browser#setup).

## Deploy your own

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-msw&project-name=with-msw&repository-name=with-msw)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-msw with-msw-app
```

```bash
yarn create next-app --example with-msw with-msw-app
```

```bash
pnpm create next-app --example with-msw with-msw-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
