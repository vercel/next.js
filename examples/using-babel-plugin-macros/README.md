[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/using-babel-plugin-macros)

# Using babel-plugin-macros example

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/segmentio/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example using-babel-plugin-macros using-babel-plugin-macros-app
# or
yarn create next-app --example using-babel-plugin-macros using-babel-plugin-macros-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/using-babel-plugin-macros
cd using-babel-plugin-macros
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

This example shows how to:

1. Use one of [the growing list of macros](https://www.npmjs.com/search?q=keywords:babel-plugin-macros) which are published to npm
2. Write and use a custom macro written within the project
