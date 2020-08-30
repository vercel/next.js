# Unstated example

This example shows how to integrate [Unstated Next](https://github.com/jamiebuilds/unstated-next) with Next.js.

There are two pages, `/` and `/about`, both render a counter and a timer, the state is saved for the current page and resetted when switching to a different page. To keep a shared state between pages you can add the state providers to `pages/_app.js` instead of using the page.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/project?template=https://github.com/vercel/next.js/tree/canary/examples/with-unstated)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-unstated with-unstated-app
# or
yarn create next-app --example with-unstated with-unstated-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
