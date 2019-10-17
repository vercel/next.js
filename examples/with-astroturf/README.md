# Example app with [astroturf](https://github.com/4Catalyzer/astroturf)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-astroturf with-astroturf-app
# or
yarn create next-app --example with-astroturf with-astroturf-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-astroturf
cd with-astroturf
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

This example features how to use [astroturf](https://github.com/4Catalyzer/astroturf) as the zero-runtime CSS-in-JS styling solution instead of [styled-jsx](https://github.com/zeit/styled-jsx).
