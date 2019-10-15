# react-css-modules example

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-react-css-modules with-react-css-modules-app
# or
yarn create next-app --example with-react-css-modules with-react-css-modules-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-react-css-modules
cd with-react-css-modules
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

[`react-css-modules`](https://github.com/gajus/react-css-modules) implement automatic mapping of CSS modules. Every CSS class is assigned a local-scoped identifier with a global unique name.

This example shows how to integrate [`babel-plugin-react-css-modules`](https://github.com/gajus/babel-plugin-react-css-modules) in Next.js.
