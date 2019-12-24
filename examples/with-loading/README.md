# Example app with page loading indicator

## Deploy your own

Deploy the example using [ZEIT Now](https://zeit.co/now):

[![Deploy with ZEIT Now](https://zeit.co/button)](https://zeit.co/new/project?template=https://github.com/zeit/next.js/tree/canary/examples/with-loading)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-loading with-loading-app
# or
yarn create next-app --example with-loading with-loading-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-loading
cd with-loading
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

Sometimes when switching between pages, Next.js needs to download pages(chunks) from the server before rendering the page. And it may also need to wait for the data. So while doing these tasks, browser might be non responsive.

We can simply fix this issue by showing a loading indicator. That's what this examples shows.

It features:

- An app with two pages which uses a common [Header](./components/Header.js) component for navigation links.
- Using `next/router` to identify different router events
- Uses [nprogress](https://github.com/rstacruz/nprogress) as the loading indicator.
