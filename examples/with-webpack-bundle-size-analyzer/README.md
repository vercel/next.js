# Webpack Bundle Size Analyzer

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-webpack-bundle-size-analyzer with-webpack-bundle-size-analyzer-app
# or
yarn create next-app --example with-webpack-bundle-size-analyzer with-webpack-bundle-size-analyzer-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-webpack-bundle-size-analyzer
cd with-webpack-bundle-size-analyzer
```

Install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

## The idea behind the example

This example shows how to analyze the output bundles using [webpack-bundle-size-analyzer](https://www.npmjs.com/package/webpack-bundle-size-analyzer)

To analyze your webpack output, invoke the following command:

```bash
npm run analyze
# or
yarn analyze
```
