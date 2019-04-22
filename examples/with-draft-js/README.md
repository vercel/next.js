# DraftJS Medium editor inspiration

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/segmentio/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-draft-js
# or
yarn create next-app --example with-draft-js with-draft-js-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-draft-js
cd with-draft-js
```

Install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

Deploy it to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download)):

```bash
now
```

## The idea behind the example

Have you ever wanted to have an editor like medium.com in your Next.js app? DraftJS is avalaible for SSR, but some plugins like the toolbar are using `window`, which does not work when doing SSR.

This example aims to provides a fully customizable example of the famous medium editor with DraftJS. The goal was to get it as customizable as possible, and fully working with Next.js without using the react-no-ssr package.
