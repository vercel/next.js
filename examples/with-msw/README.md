# Mock Service Worker Example

[Mock Service Worker](https://github.com/mswjs/msw) is an API mocking library for browser and Node. It provides seamless mocking by interception of actual requests on the network level using Service Worker API. This makes your application unaware of any mocking being at place.

In this example we integrate Mock Service Worker with Next by following the next steps:

1. Define a set of [request handlers](./mocks/handlers.js) shared between client and server.
1. Setup a [Service Worker instance](./mocks/browser.js) that would intercept all runtime client-side requests via `setupWorker` function.
1. Setup a ["server" instance](./mocks/server.js) to intercept any server/build time requests (e.g. the one happening in `getInitialProps` or `getServerSideProps`) via `setupServer` function.

## How to use

### Using `create-next-app`

Execute `create-next-app` with `Yarn` or `npx` to bootstrap the example:

```bash
npx create-next-app --example with-msw
# or
yarn create next-app --example with-msw
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/vercel/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-msw
cd with-msw
```

Install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```
