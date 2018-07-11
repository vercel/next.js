[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/with-google-analytics)

# Example app with analytics

## How to use

### Using `create-next-app`

Download [`create-next-app`](https://github.com/segmentio/create-next-app) to bootstrap the example:

```bash
npx create-next-app --example with-google-analytics with-google-analytics-app
# or
yarn create next-app --example with-google-analytics with-google-analytics-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-google-analytics
cd with-google-analytics
```

Install it and run:

```bash
yarn
yarn dev
```

Deploy it to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download))

```bash
now
```

## The idea behind the example

This example shows how to use [Next.js](https://github.com/zeit/next.js) along with [Google Analytics](https://developers.google.com/analytics/devguides/collection/gtagjs/). A custom [\_document](https://github.com/zeit/next.js/#custom-document) is used to inject [tracking snippet](https://developers.google.com/analytics/devguides/collection/gtagjs/) and track [pageviews](https://developers.google.com/analytics/devguides/collection/gtagjs/pages) and [event](https://developers.google.com/analytics/devguides/collection/gtagjs/events).
