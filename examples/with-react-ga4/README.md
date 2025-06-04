# React-GA4 example

As of May 2023, [react-ga](https://github.com/react-ga/react-ga/issues/541) uses Universal Analytics which will stop processing new data starting July 2023. Until this is fixed, this example has been updated to use [react-ga4](https://github.com/codler/react-ga4) instead.

This example shows the most basic way to use [react-ga4](https://github.com/codler/react-ga4) using a custom [App](https://github.com/vercel/next.js#custom-app)
component with Next.js. Modify `Tracking ID` in `utils/analytics.js` file for testing this example.

## Deploy your own

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-react-ga&project-name=with-react-ga&repository-name=with-react-ga)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-react-ga4 with-react-ga-app
```

```bash
yarn create next-app --example with-react-ga4 with-react-ga-app
```

```bash
pnpm create next-app --example with-react-ga4 with-react-ga-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
