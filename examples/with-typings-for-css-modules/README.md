[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/with-typings-for-css-modules)

# Typings for CSS Modules example

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/segmentio/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-typings-for-css-modules with-typings-for-css-modules-app
# or
yarn create next-app --example with-typings-for-css-modules with-typings-for-css-modules-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-typings-for-css-modules
cd with-typings-for-css-modules
```

Install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

Deploy it to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download))

```bash
now
```

## The idea behind the example

This example shows how to generate type declarations for using CSS modules with TypeScript. It uses the [next-css](https://github.com/zeit/next-plugins/tree/master/packages/next-css) and [next-typescript](https://github.com/zeit/next-plugins/tree/master/packages/next-typescript) plugins with [typings-for-css-modules-loader](https://www.npmjs.com/package/typings-for-css-modules-loader). With additional samples of how to apply using sass, less and stylus.
