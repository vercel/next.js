# Using multiple zones

With Next.js you can use multiple apps as a single app using its [multi-zones feature](https://nextjs.org/docs/advanced-features/multi-zones). This is an example showing how to use it.

- All pages should be unique across zones. For example, the `home` app should not have a `pages/blog/index.js` page.
- The `blog` app sets [`assetPrefix`](https://nextjs.org/docs/api-reference/next.config.js/cdn-support-with-asset-prefix) so that generated JS bundles are within the `/blog` subfolder.
  - To also support the plain `next dev` scenario, `assetPrefix` is only set for production builds, see [`blog/next.config.js`](blog/next.config.js).
  - Images and other `static` assets have to be prefixed manually. The static assets added by `/blog` are under `public/blog/static` to avoid conflicts with `/home`

## Deploy your own

Deploy the example using [Vercel](https://vercel.com):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/project?template=https://github.com/vercel/next.js/tree/canary/examples/with-zones)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-zones with-zones-app
# or
yarn create next-app --example with-zones with-zones-app
```

With multi zones you have multiple Next.js apps over a single app, therefore every app has its own dependencies and it runs independently.

To start the `/home` run the following commands from the root directory:

```bash
cd home
npm install && npm run dev
# or
cd home
yarn && yarn dev
```

The `/home` app should be up and running in [http://localhost:3000](http://localhost:3000)!

Starting the `/blog` app follows a very similar process. In a new terminal, run the following commands from the root directory :

```bash
cd blog
npm install && npm run dev
# or
cd blog
yarn && yarn dev
```

The `blog` app should be up and running in [http://localhost:4000](http://localhost:4000)!

Deploy it to the cloud with [Vercel](https://vercel.com/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
