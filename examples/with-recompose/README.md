# Recompose example

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/segmentio/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-recompose with-recompose-app
# or
yarn create next-app --example with-recompose with-recompose-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-recompose
cd with-recompose
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

This example show how to use [Recompose](https://github.com/acdlite/recompose) to wrap page components using High Order Components and use `getInitialProps` without worries.

It also configure Babel to change our recompose imports so we're going to actually import only the functions we need and reduce the bundle size.
