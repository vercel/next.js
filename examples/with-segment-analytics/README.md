# Example app with analytics

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-segment-analytics with-segment-analytics-app
# or
yarn create next-app --example with-segment-analytics with-segment-analytics-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-segment-analytics
cd with-segment-analytics
```

Install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

Deploy it to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download))

```bash
now
```

## The idea behind the example

This example shows how to use Next.js along with [Segment Analytics](https://segment.com). A custom document is used in inject the [Segment snippet](https://github.com/segmentio/snippet) into the `<head>`. Page views are tracked on both the server and client side and components fire ["track"](https://segment.com/docs/spec/track/) events based on user actions (see `contact.js` for example).
