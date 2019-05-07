# Example app with prefetching pages

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/segmentio/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-prefetching with-prefetching-app
# or
yarn create next-app --example with-prefetching with-prefetching-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-prefetching
cd with-prefetching
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

This example features:

- An app with four simple pages
- The "about" page uses the imperative (i.e.: "manual") prefetching API to prefetch on hover
- It will prefetch all the pages in the background except the "contact" page
