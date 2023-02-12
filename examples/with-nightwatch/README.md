# Next.js + Nightwatch.js

This example shows how to configure [Nightwatch.js](https://nightwatchjs.org) to test a Next.js application, both for component and end-to-end testing. 

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) or preview live with [StackBlitz](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/with-nightwatch)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-nightwatch&project-name=with-nightwatch&repository-name=with-nightwatch)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-nightwatch with-nightwatch-app
```

```bash
yarn create next-app --example with-nightwatch with-nightwatch-app
```

```bash
pnpm create next-app --example with-nightwatch with-nightwatch-app
```

## Run end-to-end tests

```bash
npm run test:e2e
```

Pass the `--headless` flag to run the tests in headless mode, e.g.:

```bash

npm run test:e2e -- --headless

```

## Run component tests

```bash
npm test
```

## Learn More
- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Nightwatch.js Guide](https://nightwatchjs.org/guide)
- [React Component Testing with Nightwatch.js](https://nightwatchjs.org/guide/component-testing/testing-react-components.html)


Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
