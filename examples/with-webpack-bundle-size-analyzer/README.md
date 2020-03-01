# Webpack Bundle Size Analyzer

This example shows how to analyze the output bundles using [webpack-bundle-size-analyzer](https://www.npmjs.com/package/webpack-bundle-size-analyzer)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npm init next-app --example with-webpack-bundle-size-analyzer with-webpack-bundle-size-analyzer-app
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

## Notes

To analyze your webpack output, invoke the following command:

```bash
npm run analyze
# or
yarn analyze
```
