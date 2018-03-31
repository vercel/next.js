[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/with-segment-analytics)

# Example app with analytics

## How to use

### Using `create-next-app`

Download [`create-next-app`](https://github.com/segmentio/create-next-app) to bootstrap the example:

```bash
npx create-next-app --example with-segment-analytics with-segment-analytics-app
# or
yarn create next-app --example with-segment-analytics with-segment-analytics-app
```

### Download manually

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-segment-analytics
cd with-segment-analytics
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

This example shows how to use Next.js along with [Segment Analytics](https://segment.com). A custom document is used in inject the [Segment snippet](https://github.com/segmentio/snippet) into the `<head>` and components fire ["track"](https://segment.com/docs/spec/track/) events based on user actions.
