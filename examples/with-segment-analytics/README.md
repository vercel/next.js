# With Segment Analytics

This example shows how to use Next.js along with [Segment Analytics](https://segment.com) using [segmentio/analytics-next](https://github.com/segmentio/analytics-next). The main app [layout](https://github.com/vercel/next.js/blob/canary/examples/with-segment-analytics/app/layout.tsx) includes a Client Component (analytics.tsx)[(https://github.com/vercel/next.js/blob/canary/examples/with-segment-analytics/components/analytics.tsx)] which loads Segment and also exports the `analytics` object which can be imported and used to call the [Track API](https://segment.com/docs/connections/spec/track/) on user actions (Refer to [`contact.tsx`](https://github.com/vercel/next.js/blob/canary/examples/with-segment-analytics/app/contact/page.tsx)).

## Deploy your own

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-segment-analytics&project-name=with-segment-analytics&repository-name=with-segment-analytics)

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
