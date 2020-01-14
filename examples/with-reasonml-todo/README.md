# Example app using ReasonML & ReasonReact components

This example builds upon the original `with-reasonml` example to show how a
global state object can be used to track state across page within the application.

It is intended to show how to build a simple, stateful application using hooks
without the added complexity of a redux type library.

## Deploy your own

Deploy the example using [ZEIT Now](https://zeit.co/now):

[![Deploy with ZEIT Now](https://zeit.co/button)](https://zeit.co/new/project?template=https://github.com/zeit/next.js/tree/canary/examples/with-reasonml-todo)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with
[Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or
[npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-reasonml-todo with-reasonml-app
# or
yarn create next-app --example with-reasonml-todo with-reasonml-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-reasonml-todo
cd with-reasonml-todo
```

Install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

Build and run:

```bash
npm run build
npm run start
# or
yarn build
yarn start
```

Deploy it to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download)):

```bash
now
```

### Recommendation:

Run BuckleScript build system `bsb -w` and `next -w` separately. For the sake
of simple convention, `npm run dev` run both `bsb` and `next` concurrently.
However, this doesn't offer the full [colorful and very, very, veeeery nice
error
output](https://reasonml.github.io/blog/2017/08/25/way-nicer-error-messages.html)
experience that ReasonML can offer, don't miss it!

There are 2 convenience scripts to facilitate running these separate processes:

1. `npm run dev:reason` - This script will start the ReasonML toolchain in
   watch mode to re-compile whenever you make changes.
2. `npm run dev:next` - This script will start the next.js development server
   so that you will be able to access your site at the location output by the
   script. This will also hot reload as you make changes.

You should start the scripts in the presented order.

## The idea behind the example

This example features:

- An app that mixes together JavaScript and ReasonML components and functions
- An app with two pages which has a common Counter component
- That Counter component maintain the counter inside its module. This is used
  primarily to illustrate that modules get initialized once and their state
  variables persist in runtime
