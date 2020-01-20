# Example with pkg

This example demonstrate how you can use [pkg](https://github.com/zeit/pkg) to create a binary version of a Next.js application.

To do it we need to create at least a super simple custom server that allow us to run `node server.js` instead of `next` or `next start`. We also need to create a `index.js` that works as the entry point for **pkg**, in that file we force to set NODE_ENV as production.

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npm init next-app --example with-pkg with-pkg-app
# or
yarn create next-app --example with-pkg with-pkg-app
```

### Download manually

Download the example:

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
