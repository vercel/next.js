# Example app with Storybook

This example shows a default set up of Storybook. Also included in the example is a custom component included in both Storybook and the Next.js application.

### TypeScript

As of v6.0, Storybook has built-in TypeScript support, so no configuration is needed. If you want to customize the default configuration, refer to the [TypeScript docs](https://storybook.js.org/docs/react/configure/typescript).

## Preview

Preview the example live on [StackBlitz](http://stackblitz.com/):

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/with-storybook)

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-storybook&project-name=with-storybook&repository-name=with-storybook)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-storybook with-storybook-app
# or
yarn create next-app --example with-storybook with-storybook-app
```

### Run Storybook

```bash
npm run storybook
# or
yarn storybook
```

### Build Static Storybook

```bash
npm run build-storybook
# or
yarn build-storybook
```

You can use [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) to deploy Storybook. Specify `storybook-static` as the output directory.
