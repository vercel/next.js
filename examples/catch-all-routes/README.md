# Catch All Routes Example

This example shows how to use [Catch all routes](https://nextjs.org/docs/routing/dynamic-routes#catch-all-routes) in Next.js, which allows a dynamic route to catch all paths.

The catch all page is in `pages/post/[...slug]`, it matches any path after `/post`, like the following:

- `/post/first-post`,
- `/post/2020/first-post`
- `/post/2020/first-post/with/catch/all/routes`
- Anything that matches the glob `/post/**`

You can use `next/link` as displayed in this example to route to these pages client side.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/project?template=https://github.com/vercel/next.js/tree/canary/examples/catch-all-routes)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example catch-all-routes catch-all-routes-app
# or
yarn create next-app --example catch-all-routes catch-all-routes-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
