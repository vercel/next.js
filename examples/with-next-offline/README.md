# next-offline example

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-next-offline with-next-offline-app
# or
yarn create next-app --example with-next-offline with-next-offline-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-next-offline
cd with-next-offline
```

Install it and run:

```bash
npm install
npm run dev
npm run export
serve -s out
# or
yarn
yarn dev
yarn export
serve -s out
```

Deploy it to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download))

```bash
now
```

## The idea behind the example

This example demonstrates how to use the [next-offline plugin](https://github.com/hanford/next-offline) It includes manifest.json to install app via chrome
