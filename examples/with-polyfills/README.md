# Example app with polyfills

> ❗️ Warning: This example is not the suggested way to add polyfills and is known to cause issues with bundling. See [the browser support docs](https://nextjs.org/docs/basic-features/supported-browsers-features#custom-polyfills) for the correct way to load polyfills.

Next.js supports modern browsers and IE 11. It loads required polyfills automatically. If you need to add custom polyfills, you can follow this example.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/project?template=https://github.com/vercel/next.js/tree/canary/examples/with-polyfills)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-polyfills with-polyfills-app
# or
yarn create next-app --example with-polyfills with-polyfills-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/vercel/next.js/tar.gz/master | tar -xz --strip=2 next.js-master/examples/with-polyfills
cd with-polyfills
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
