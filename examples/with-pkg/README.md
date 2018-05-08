# Example with pkg

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/segmentio/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-pkg with-pkg-app
# or
yarn create next-app --example with-pkg with-pkg-app
```

### Download manually

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-pkg
cd with-pkg
```

Install it and run pkg:

```bash
npm install
yarn run build
yarn run dist
```

Execute the binary file:

```bash
PORT=4000 ./dist/with-pkg-macos
```

Deploy it to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download))

```bash
now
```

## The idea behind the example

This example demonstrate how you can use [pkg](https://github.com/zeit/pkg) to create a binary version of a Next.js application.

To do it we need to create at least a super simple custom server that allow us to run `node server.js` instead of `next` or `next start`. We also need to create a `index.js` that works as the entry point for **pkg**, in that file we force to set NODE_ENV as production.
