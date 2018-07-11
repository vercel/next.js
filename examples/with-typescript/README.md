[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/with-typescript)

# TypeScript Next.js example

This is a really simple project that show the usage of Next.js with TypeScript.

## How to use it?

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/segmentio/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-typescript with-typescript-app
# or
yarn create next-app --example with-typescript with-typescript-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-typescript
cd with-typescript
```

Install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

## The idea behind the example

Use the [@zeit/next-typescript](https://github.com/zeit/next-plugins/tree/master/packages/next-typescript) plugin to inject the Webpack config required to compile TypeScript to JavaScript. For information about using a TSConfig have a [look at the plugin page](https://github.com/zeit/next-plugins/tree/master/packages/next-typescript/#readme).
