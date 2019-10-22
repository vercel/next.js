# Example app with carbon-components-react

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-carbon-components with-carbon-components-app
# or
yarn create next-app --example with-carbon-components with-carbon-components-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-carbon-components
cd with-carbon-components
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

This example features how you use IBM's [carbon-components-react](https://github.com/IBM/carbon-components-react) [(Carbon Design System)](http://www.carbondesignsystem.com/components/overview) with Next.js.

Create your own theme with Carbon Design System's [theming tools](http://themes.carbondesignsystem.com/) and put it all together as demonstrated in `static/myCustomTheme.scss`
