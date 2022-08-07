# Analyzer Bundles example

This example shows how to analyze the output bundles using [@next/bundle-analyzer](https://github.com/vercel/next.js/tree/canary/packages/next-bundle-analyzer)

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) or preview live with [StackBlitz](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/analyze-bundles)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/analyze-bundles&project-name=analyze-bundles&repository-name=analyze-bundles)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example analyze-bundles analyze-bundles-app
```

```bash
yarn create next-app --example analyze-bundles analyze-bundles-app
```

```bash
pnpm create next-app --example analyze-bundles analyze-bundles-app
```

### Analyze webpack output

To analyze your webpack output, invoke the following command:

```bash
npm run analyze
# or
yarn analyze
```

Once the build is completed, you can inspect the bundle by running:

```bash
npm run serve
# or
yarn serve
```
