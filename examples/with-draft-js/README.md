# DraftJS Medium editor inspiration

Have you ever wanted to have an editor like medium.com in your Next.js app? DraftJS is available for SSR, but some plugins like the toolbar are using `window`, which does not work when doing SSR.

This example aims to provide a fully customizable example of the famous medium editor with DraftJS. The goal was to get it as customizable as possible, and fully working with Next.js without using the react-no-ssr package.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) or preview live with [StackBlitz](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/with-draft-js)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-draft-js&project-name=with-draft-js&repository-name=with-draft-js)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-draft-js with-draft-js-app
```

```bash
yarn create next-app --example with-draft-js with-draft-js-app
```

```bash
pnpm create next-app --example with-draft-js with-draft-js-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
