[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/with-webpack-bundle-size-analyzer)

# Webpack Bundle Size Analyzer

## How to use

### Using `create-next-app`

Download [`create-next-app`](https://github.com/segmentio/create-next-app) to bootstrap the example:

```
npm i -g create-next-app
create-next-app --example with-webpack-bundle-size-analyzer with-webpack-bundle-size-analyzer-app
```

### Download manually

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/master | tar -xz --strip=2 next.js-master/examples/with-webpack-bundle-size-analyzer
cd with-webpack-bundle-size-analyzer
```

Install it

```bash
npm install
```

## The idea behind the example

This example shows how to analyze the output bundles using [webpack-bundle-size-analyzer](https://www.npmjs.com/package/webpack-bundle-size-analyzer)

To analyze your webpack output, invoke the following command:

```bash
npm run analyze
```
