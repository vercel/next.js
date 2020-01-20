# Example app with google analytics & amp

This example shows how to use [Next.js](https://github.com/zeit/next.js) along with [Google Analytics](https://developers.google.com/analytics/devguides/collection/gtagjs/) in conjunction with [AMP](https://nextjs.org/docs#amp-support). A custom [\_document](https://github.com/zeit/next.js/#custom-document) is used to inject [tracking snippet](https://developers.google.com/analytics/devguides/collection/gtagjs/) and track [pageviews](https://developers.google.com/analytics/devguides/collection/gtagjs/pages) and [event](https://developers.google.com/analytics/devguides/collection/gtagjs/events). There are two separate initializations of the Google Analytics tracking code; one for AMP and one for non-AMP pages.

## Deploy your own

Deploy the example using [ZEIT Now](https://zeit.co/now):

[![Deploy with ZEIT Now](https://zeit.co/button)](https://zeit.co/new/project?template=https://github.com/zeit/next.js/tree/canary/examples/with-google-analytics-amp)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example::

```bash
npm init next-app --example with-google-analytics-amp with-google-analytics-amp-app
# or
yarn create next-app --example with-google-analytics-amp with-google-analytics-amp-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-google-analytics-amp
cd with-google-analytics-amp
```

Install it and run:

```bash
yarn
yarn dev
```

Deploy it to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download)):

```bash
now
```
