# DraftJS Medium editor inspiration

Have you ever wanted to have an editor like medium.com in your Next.js app? DraftJS is available for SSR, but some plugins like the toolbar are using `window`, which does not work when doing SSR.

This example aims to provides a fully customizable example of the famous medium editor with DraftJS. The goal was to get it as customizable as possible, and fully working with Next.js without using the react-no-ssr package.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/project?template=https://github.com/vercel/next.js/tree/canary/examples/with-draft-js)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-draft-js
# or
yarn create next-app --example with-draft-js with-draft-js-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
