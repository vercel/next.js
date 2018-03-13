[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/with-webpack-bundle-analyzer)

# Webpack Bundle Analyzer example

## How to use

### Using `create-next-app`

Download [`create-next-app`](https://github.com/segmentio/create-next-app) to bootstrap the example:

```bash
npx create-next-app --example with-webpack-bundle-analyzer with-webpack-bundle-analyzer-app
# or
yarn create next-app --example with-webpack-bundle-analyzer with-webpack-bundle-analyzer-app
```

### Download manually

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-webpack-bundle-analyzer
cd with-webpack-bundle-analyzer
```

Install it

```bash
npm install
```

## The idea behind the example

This example shows how to analyze the output bundles using [webpack-bundle-analyzer](https://github.com/th0r/webpack-bundle-analyzer#as-plugin)

To analyze your webpack output, invoke the following command:

```bash
npm run analyze
```
