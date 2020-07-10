# Using multiple zones

With Next.js you can use multiple apps as a single app using it's [multi-zones feature](https://nextjs.org/docs/advanced-features/multi-zones). This is an example showing how to use it.

- All pages should be unique across zones. For example, the `home` app should not have a `pages/blog/index.js` page.
- The `blog` app sets [`assetPrefix`](https://nextjs.org/docs/api-reference/next.config.js/cdn-support-with-asset-prefix) so that generated JS bundles are within the `/blog` subfolder.
  - To also support the plain `next dev` scenario, `assetPrefix` is set dynamically based on the `BUILDING_FOR_NOW` environment variable, see [`vercel.json`](vercel.json) and [`blog/next.config.js`](blog/next.config.js).
  - Images and other `static` assets have to be prefixed manually, e.g., `` <img src={`${process.env.ASSET_PREFIX}/static/image.png`} /> ``, see [`blog/pages/blog/index.js`](blog/pages/blog/index.js).

## Deploy your own

Deploy the example using [Vercel](https://vercel.com):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/project?template=https://github.com/vercel/next.js/tree/canary/examples/with-zones)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-zones with-zones-app
# or
yarn create next-app --example with-zones with-zones-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/vercel/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-zones
cd with-zones
```

Install the dependencies of every app (`/home` and `/blog`):

```bash
npm install
# or
yarn
```

Install the [Vercel CLI](https://vercel.com/download) if you don't have it already, and then run [`vercel dev`](https://vercel.com/docs/cli?query=dev#commands/dev) in the main directory to start the development server:

```bash
vercel dev
```

Your app should be up and running on [http://localhost:3000](http://localhost:3000)!

> We recommend `vercel dev` in this case instead of `next dev`, as it can start both apps at the same time and use the routes defined in [`vercel.json`](vercel.json)

Deploy it to the cloud with [Vercel](https://vercel.com/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
