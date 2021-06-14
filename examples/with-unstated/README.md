# Unstated example

This example shows how to integrate [Unstated Next](https://github.com/jamiebuilds/unstated-next) with Next.js.

There are two pages, `/` and `/about`, both render a counter and a timer, the state is saved for the current page and reset when switching to a different page. To keep a shared state between pages you can add the state providers to `pages/_app.js` instead of using the page.

## Preview

Preview the example live on [StackBlitz](http://stackblitz.com/):

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/with-unstated)

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-unstated&project-name=with-unstated&repository-name=with-unstated)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-unstated with-unstated-app
# or
yarn create next-app --example with-unstated with-unstated-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
