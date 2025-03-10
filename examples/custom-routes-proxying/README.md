# Custom Routes Proxying Example

This example shows the most basic example using Next.js' new custom routes feature to proxy requests to an upstream server. We have 3 pages: `app/page.tsx`, `app/about/page.tsx`, and `app/hello/[slug]/page.tsx`. All of these pages will be matched against Next.js and any other path will be proxied to the upstream server.

This approach is very helpful when you are trying to incrementally migrate your application to Next.js but still need to fallback to an existing application. You can add pages to your Next.js application one-by-one and then for non-migrated pages Next.js can proxy to the existing application until they are able to be migrated.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) or preview live with [StackBlitz](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/custom-routes-proxying)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/custom-routes-proxying)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example custom-routes-proxying custom-routes-proxying-app
```

```bash
yarn create next-app --example custom-routes-proxying custom-routes-proxying-app
```

```bash
pnpm create next-app --example custom-routes-proxying custom-routes-proxying-app
```

### Step 4. Run Next.js in development mode

```bash
npm install
npm run dev
# or
yarn install
yarn dev
```

Test out visiting one of the Next.js pages https://localhost:3000/ and then a non-Next.js page like http://localhost:3000/legacy-first.html or http://localhost:3000/another-legacy.html which will be proxied to the upstream server since it doesn't match any pages/assets in Next.js.

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)). Note: to deploy this example you will need to configure an existing upstream server.
