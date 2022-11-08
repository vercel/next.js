# Why did you render

This is a simple example of how to use [why-did-you-render](https://github.com/welldone-software/why-did-you-render) within a Next.js app.

We are essentially extending webpack config to allow the monkey patched `React` version of WDYR in development mode and adding to our application
by importing `wdyr.js` at the top of Next.js `_app.js`.

By default, all pure components will be tracked, but you can add
`Component.whyDidYouRender = true` to regular function components in case you need.

In this example, the header component will rerender despite the state staying the same.

You can see `why-did-you-render` console logs about this redundant re-render in the developer console.

When using Typescript, call the file `wdyr.ts` instead and add the following line to the top of the file to import the package's types:

```
/// <reference types="@welldone-software/why-did-you-render" />
```

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) or preview live with [StackBlitz](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/with-why-did-you-render)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-why-did-you-render&project-name=with-why-did-you-render&repository-name=with-why-did-you-render)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-why-did-you-render with-why-did-you-render-app
```

```bash
yarn create next-app --example with-why-did-you-render with-why-did-you-render-app
```

```bash
pnpm create next-app --example with-why-did-you-render with-why-did-you-render-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
