# Example App with next-less

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/segmentio/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-next-less with-next-less-app
# or
yarn create next-app --example with-next-less with-next-less-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-next-less
cd with-next-less
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

This example demonstrates how to use the [next-less plugin](https://github.com/zeit/next-plugins/tree/master/packages/next-less).<br>
It includes patterns for with and without CSS Modules, with PostCSS and with additional webpack configurations on top of the next-less plugin.
