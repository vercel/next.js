# Custom Routes Proxying Example

This example shows the most basic example using Next.js' new custom routes feature to proxy requests to an upstream server. We have 3 pages: `pages/index.js`, `pages/about.js`, and `pages/hello/[slug].js`. All of these pages will be matched against Next.js and any other path will be proxied to the upstream server.

This approach is very helpful when you are trying to incrementally migrate your application to Next.js but still need to fallback to an existing application. You can add pages to your Next.js application one-by-one and then for non-migrated pages Next.js can proxy to the existing application until they are able to be migrated.

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example custom-routes-proxying custom-routes-proxying-app
# or
yarn create next-app --example custom-routes-proxying custom-routes-proxying-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/vercel/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/custom-routes-proxying
cd custom-routes-proxying
```

Install it:

```bash
npm install
# or
yarn
```

Start upstream server in one terminal

```bash
npm run start-upstream
# or
yarn start-upstream
```

Start Next.js in another terminal

```bash
npm run dev
# or
yarn dev
```

Deploy it to the cloud with [Vercel](https://vercel.com/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)). Note: to deploy this example you will need to configure an existing upstream server.
