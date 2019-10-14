# Named routes example ([next-routes](https://github.com/fridays/next-routes))

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-next-routes with-next-routes-app
# or
yarn create next-app --example with-next-routes with-next-routes-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-next-routes
cd with-next-routes
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

This example uses [next-routes](https://github.com/fridays/next-routes) for dynamic routing, which lets you define parameterized, named routes with express-style parameters matching.

It works similar to the [parameterized-routing](https://github.com/zeit/next.js/tree/master/examples/parameterized-routing) example and makes use of next.js [custom server and routing](https://github.com/zeit/next.js#custom-server-and-routing) possibilities.
