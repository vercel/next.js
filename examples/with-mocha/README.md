# Example app with Mocha tests

This example features an app with Mocha tests.

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-mocha with-mocha-app
# or
yarn create next-app --example with-mocha with-mocha-app
```

## Run Mocha tests

```bash
npm run test
# or
yarn test
```

> A very important part of this example is the `.babelrc` file which configures the `test` environment to use `babel-preset-env` and configures it to transpile modules to `commonjs`). [Learn more](https://github.com/vercel/next.js/issues/2895).
