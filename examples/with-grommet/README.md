# Example app with Grommet

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-grommet with-grommet-app
# or
yarn create next-app --example with-grommet with-grommet-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-grommet
cd with-grommet
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

### Try it on CodeSandbox

[Open this example on CodeSandbox](https://codesandbox.io/s/github/zeit/next.js/tree/canary/examples/with-grommet)

## The idea behind the example

This example shows how to use the [Grommet UI library](https://grommet.io/) with Next.js.

It works by extending the `<Document />` to enable server-side rendering of `styled-components`, which are used by Grommet, and extending `<App />` to provide a Grommet context (and optionally a theme) for all child pages and components.
