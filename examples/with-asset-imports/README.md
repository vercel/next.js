# Example app with asset imports

## How to use

### Using `create-next-app`

Download [`create-next-app`](https://github.com/segmentio/create-next-app) to bootstrap the example:

```
npm i -g create-next-app
create-next-app --example with-asset-imports with-asset-imports-app
```

### Download manually

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-asset-imports
cd with-asset-imports
```

Install it and run:

```bash
npm install
npm run dev
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
