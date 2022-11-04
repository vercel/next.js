# Example app with analytics

This example shows how to use Next.js along with [Segment Analytics](https://segment.com). A [custom app](https://nextjs.org/docs/advanced-features/custom-app) is used to inject the [Segment Analytics.js snippet](https://github.com/segmentio/snippet). The server and client-side call the [Page API](https://segment.com/docs/connections/spec/page/), while components call the [Track API](https://segment.com/docs/connections/spec/track/) on user actions (Refer to [`contact.js`](https://github.com/vercel/next.js/blob/canary/examples/with-segment-analytics/pages/contact.js)).

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) or preview live with [StackBlitz](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/with-segment-analytics)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-segment-analytics&project-name=with-segment-analytics&repository-name=with-segment-analytics)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-segment-analytics with-segment-analytics-app
```

```bash
yarn create next-app --example with-segment-analytics with-segment-analytics-app
```

```bash
pnpm create next-app --example with-segment-analytics with-segment-analytics-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
