[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/ssr-caching)

# Example app where it caches SSR'ed pages in the memory

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/segmentio/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example ssr-caching ssr-caching-app
# or
yarn create next-app --example ssr-caching ssr-caching-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/ssr-caching
cd ssr-caching
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

React Server Side rendering is very costly and takes a lot of server's CPU power for that. One of the best solutions for this problem is cache already rendered pages.
That's what this example demonstrate.

This app uses Next's [custom server and routing](https://github.com/zeit/next.js#custom-server-and-routing) mode. It also uses [express](https://expressjs.com/) to handle routing and page serving.

Alternatively, see [the example using React ESI](../with-react-esi/).
