# Catch All Routes Example

This example shows how to use [Catch all routes](https://nextjs.org/docs/routing/dynamic-routes#catch-all-routes) in Next.js, which allows a dynamic route to catch all paths.

The catch all page is in `pages/post/[...slug]`, it matches any path after `/post`, like the following:

- `/post/first-post`,
- `/post/2020/first-post`
- `/post/2020/first-post/with/catch/all/routes`
- Anything that matches the glob `/post/**`

You can use `next/link` as displayed in this example to route to these pages client side.

## Deploy your own

Deploy the example using [ZEIT Now](https://zeit.co/now):

[![Deploy with ZEIT Now](https://zeit.co/button)](https://zeit.co/new/project?template=https://github.com/zeit/next.js/tree/canary/examples/catch-all-routes)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npm init next-app --example catch-all-routes catch-all-routes-app
# or
yarn create next-app --example catch-all-routes catch-all-routes-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/catch-all-routes
cd catch-all-routes
```

Install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

Deploy it to the cloud with [Now](https://zeit.co/now) ([download](https://zeit.co/download)):

```bash
now
```
