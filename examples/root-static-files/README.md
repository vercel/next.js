# Root static files example

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/segmentio/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example root-static-files root-static-files-app
# or
yarn create next-app --example root-static-files root-static-files-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/root-static-files
cd root-static-files
```

Install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

### Serverless

With now version 2, using a custom server to route files from the static folder is no longer necessary.

Simply adjust your `now.json` (similar to in this example) by using the [routes configuration](https://zeit.co/docs/v2/deployments/configuration/#routes).

Afterwards, deploy it to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download))

```bash
now
```

## The idea behind the example

This example demonstrates how to serve files such as /robots.txt and /sitemap.xml from the root in both a serverless and non-serverless environment.
