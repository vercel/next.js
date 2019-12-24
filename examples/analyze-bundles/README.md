# Analyzer Bundles example

## Deploy your own

Deploy the example using [ZEIT Now](https://zeit.co/now):

[![Deploy with ZEIT Now](https://zeit.co/button)](https://zeit.co/new/project?template=https://github.com/zeit/next.js/tree/canary/examples/analyze-bundles)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example analyze-bundles analyze-bundles-app
# or
yarn create next-app --example analyze-bundles analyze-bundles-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/analyze-bundles
cd analyze-bundles
```

Install it

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

## The idea behind the example

This example shows how to analyze the output bundles using [@next/bundle-analyzer](https://github.com/zeit/next.js/tree/master/packages/next-bundle-analyzer)

To analyze your webpack output, invoke the following command:

```bash
npm run analyze
# or
yarn analyze
```
