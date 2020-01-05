# Example app with styled-components

## Deploy your own

Deploy the example using [ZEIT Now](https://zeit.co/now):

[![Deploy with ZEIT Now](https://zeit.co/button)](https://zeit.co/new/project?template=https://github.com/zeit/next.js/tree/canary/examples/with-orbit-components)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-orbit-components with-orbit-components-app
# or
yarn create next-app --example with-orbit-components with-orbit-components-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-orbit-components
cd with-orbit-components
```

Install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

Deploy it to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download)):

```bash
now
```

## The idea behind the example

[Orbit-components](https://orbit.kiwi) is a React component library which provides developers with the easiest possible way of building Kiwi.com’s products.

For this purpose we are extending `<App />` of injected `<ThemeProvider/>`, and also adding `@kiwicom/babel-plugin-orbit-components`

This fork comes from [styled-components-example](https://github.com/zeit/next.js/tree/canary/examples/with-styled-components)
