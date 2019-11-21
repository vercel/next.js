# Example app using nested components

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example nested-components nested-components-app
# or
yarn create next-app --example nested-components nested-components-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/nested-components
cd nested-components
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

Taking advantage of the composable nature of React components we can modularize our apps in self-contained, meaningful components. This example has a page under `pages/index.js` that uses `components/paragraph.js` and `components/post.js` that can be styled and managed separately.
