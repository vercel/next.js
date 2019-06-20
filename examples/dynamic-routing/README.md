# Dynamic Routing example

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/segmentio/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example dynamic-routing dynamic-routing-app
# or
yarn create next-app --example dynamic-routing dynamic-routing-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/dynamic-routing
cd dynamic-routing
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

This example shows dynamic routing. We have 2 dynamic pages: `pages/$post/index.js` and `pages/$post/$comment.js`. The former responds to `/any-post` requests and the latter to `/any-post/any-comment`. Using `next/link` you can add hyperlinks between them with universal routing capabilities.
