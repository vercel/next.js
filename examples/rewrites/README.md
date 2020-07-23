# Rewrites Example

This example shows how to use [rewrites in Next.js](https://nextjs.org/docs/api-reference/next.config.js/rewrites).

The `Links` in the index page ([pages/index.js](pages/index.js)) will show you how to map an [incoming request path to a different destination path](https://github.com/vercel/next.js/blob/canary/docs/api-reference/next.config.js/rewrites.md#rewrites) , and how to [rewrite to an external url](https://github.com/vercel/next.js/canary/docs/api-reference/next.config.js/rewrites.md#rewriting-to-an-external-url).

## Deploy your own

Deploy the example using [Vercel](https://vercel.com):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/project?template=https://github.com/vercel/next.js/tree/canary/examples/rewrites)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example rewrites rewrites-app
# or
yarn create next-app --example rewrites rewrites-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/vercel/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/custom-routes-rewrites
cd custom-routes-rewrites
```

### Step 4. Run Next.js in development mode

```bash
npm install
npm run dev

# or

yarn install
yarn dev
```

Deploy it to the cloud with [Vercel](https://vercel.com/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
