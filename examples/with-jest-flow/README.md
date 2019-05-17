# Example app with Jest tests and [Flow](https://flowtype.org/)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/segmentio/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-jest-flow with-jest-flow-app
# or
yarn create next-app --example with-jest-flow with-jest-flow-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-jest-flow
cd with-jest-flow
```

Install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

## Run Jest tests

```bash
npm run test
# or
yarn test
```

## The idea behind the example

This example features:

* An app with jest tests
* The [Flow](https://flowtype.org/) static type checker, with the transform-flow-strip-types babel plugin stripping flow type annotations from your output code.
