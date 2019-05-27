# Example app with Mocha tests

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/segmentio/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-mocha with-mocha-app
# or
yarn create next-app --example with-mocha with-mocha-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-mocha
cd with-mocha
```

Install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

## Run Mocha tests

```bash
npm run test
# or
yarn test
```

## The idea behind the example

This example features:

- An app with Mocha tests

> A very important part of this example is the `.babelrc` file which configures the `test` environment to use `babel-preset-env` and configures it to transpile modules to `commonjs`). [Learn more](https://github.com/zeit/next.js/issues/2895).
