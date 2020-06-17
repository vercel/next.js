# Example app where it caches SSR'ed pages in the memory

React Server Side rendering is very costly and takes a lot of server's CPU power for that. One of the best solutions for this problem is cache already rendered pages.
That's what this example demonstrate.

This app uses Next's [custom server and routing](https://nextjs.org/docs/advanced-features/custom-server) mode. It also uses [express](https://expressjs.com/) to handle routing and page serving.

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example ssr-caching ssr-caching-app
# or
yarn create next-app --example ssr-caching ssr-caching-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/vercel/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/ssr-caching
cd ssr-caching
```

Install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

Deploy it to the cloud with [Vercel](https://vercel.com/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
