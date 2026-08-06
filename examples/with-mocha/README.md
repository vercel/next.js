# Example app with Mocha tests

This example features an app with Mocha tests.

## Deploy your own

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-mocha)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-mocha with-mocha-app
```

```bash
yarn create next-app --example with-mocha with-mocha-app
```

```bash
pnpm create next-app --example with-mocha with-mocha-app
```

## Run Mocha tests

```bash
npm run test
# or
yarn test
# or
pnpm test
```

> A very important part of this example is the `.babelrc` file which configures the `test` environment to use `babel-preset-env` and configures it to transpile modules to `commonjs`). [Learn more](https://github.com/vercel/next.js/issues/2895).
