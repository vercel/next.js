[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/with-data-prefetch)
# Example app with prefetching data

## How to use

### Using `create-next-app`

Download [`create-next-app`](https://github.com/segmentio/create-next-app) to bootstrap the example:

```bash
npx create-next-app --example with-data-prefetch with-data-prefetch-app
# or
yarn create next-app --example with-data-prefetch with-data-prefetch-app
```

### Download manually

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-data-prefetch
cd with-data-prefetch
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

Next.js lets you prefetch the JS code of another page just adding the `prefetch` prop to `next/link`. This can help you avoid the download time a new page you know beforehand the user is most probably going to visit.

In the example we'll extend the `Link` component to also run the `getInitialProps` (if it's defined) of the new page and save the resulting props on cache. When the user visits the page it will load the props from cache and avoid any request.

It uses `sessionStorage` as cache but it could be replaced with any other more specialized system. Like IndexedDB or just an in-memory API with a better cache strategy to prune old cache and force new fetching.

> This example is based on the [ScaleAPI article explaining this same technique](https://www.scaleapi.com/blog/increasing-the-performance-of-dynamic-next-js-websites).

**Note**: it only works in production environment. In development Next.js just avoid doing the prefetch.
