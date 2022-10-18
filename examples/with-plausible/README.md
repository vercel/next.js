# Example app with Plausible

This example shows how to use [Next.js](https://github.com/vercel/next.js) along with [Plausible](https://plausible.io) via the [next-plausible](https://github.com/4lejandrito/next-plausible) package. A custom [\_app.js](https://nextjs.org/docs/advanced-features/custom-app) is used to wrap our app with the [`PlausibleProvider`](https://github.com/4lejandrito/next-plausible#plausibleprovider-props) to track page views and [custom events](https://github.com/4lejandrito/next-plausible#send-custom-events) are shown as well.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) or preview live with [StackBlitz](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/with-plausible)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-plausible&project-name=with-plausible&repository-name=with-plausible)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example::

```bash
npx create-next-app --example with-plausible with-plausible-app
```

```bash
yarn create next-app --example with-plausible with-plausible-app
```

```bash
pnpm create next-app --example with-plausible with-plausible-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
