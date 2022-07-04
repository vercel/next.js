# Example app with Axiom

This example shows how to use a [Next.js](https://nextjs.org/) project along with [Axiom](https://axiom.co) via the [next-axiom](https://github.com/axiomhq/next-axiom) package. A custom `withAxiom` wrapper is used to wrap the next config object, middleware and API functions. The `log` object could be used from frontend, middleware and API functions.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) or preview live with [StackBlitz](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/with-axiom)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-axiom&project-name=with-axiom&repository-name=with-axiom)

Check out our [Next.js deployment documentation](https://nextjs.org/docs/deployment) for more details.

## How to use

First, run the development server:

```bash
npm run dev
# or
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `pages/index.js`. The page auto-updates as you edit the file.

[API routes](https://nextjs.org/docs/api-routes/introduction) can be accessed on [http://localhost:3000/api/hello](http://localhost:3000/api/hello). This endpoint can be edited in `pages/api/hello.js`.

The `pages/api` directory is mapped to `/api/*`. Files in this directory are treated as [API routes](https://nextjs.org/docs/api-routes/introduction) instead of React pages.


## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example::

```bash
npx create-next-app --example with-axiom with-axiom-app
# or
yarn create next-app --example with-axiom with-axiom-app
# or
pnpm create next-app --example with-axiom with-axiom-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)) and watch data coming into your Axiom dataset.
