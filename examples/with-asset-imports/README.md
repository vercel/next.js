# Example app with asset imports

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/segmentio/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-asset-imports with-asset-imports-app
# or
yarn create next-app --example with-asset-imports with-asset-imports-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-asset-imports
cd with-asset-imports
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

This example shows how to enable the imports of assets (images, videos, etc.) and get a URL pointing to `/static`.

This is also configurable to point to a CDN changing the `baseUri` to the CDN domain, something similar to this:

```json
[
  "transform-assets-import-to-string",
  {
    "baseDir": "/static",
    "baseUri": "https://cdn.domain.com"
  }
]
```
