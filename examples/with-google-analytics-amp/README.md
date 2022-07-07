# Example app with google analytics & amp

This example shows how to use [Next.js](https://github.com/vercel/next.js) along with [Google Analytics](https://developers.google.com/analytics/devguides/collection/gtagjs/) in conjunction with [AMP](https://nextjs.org/docs/advanced-features/amp-support/introduction). A custom [\_document](https://nextjs.org/docs/advanced-features/custom-document) is used to inject [tracking snippet](https://developers.google.com/analytics/devguides/collection/gtagjs/) and track [pageviews](https://developers.google.com/analytics/devguides/collection/gtagjs/pages) and [event](https://developers.google.com/analytics/devguides/collection/gtagjs/events). There are two separate initializations of the Google Analytics tracking code; one for AMP and one for non-AMP pages.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-google-analytics-amp&project-name=with-google-analytics-amp&repository-name=with-google-analytics-amp)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example::

```bash
npx create-next-app --example with-google-analytics-amp with-google-analytics-amp-app
```

```bash
yarn create next-app --example with-google-analytics-amp with-google-analytics-amp-app
```

```bash
pnpm create next-app --example with-google-analytics-amp with-google-analytics-amp-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
