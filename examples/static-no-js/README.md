[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/static-no-js)
# Static no-js Next site

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/segmentio/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example static-no-js
# or
yarn create next-app --example static-no-js static-no-js-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/static-no-js
cd static-no-js
```

Install, build and export it:

```bash
npm install
npm run build
npm run export
# or
yarn
yarn build
yarn export
```

Deploy it to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download)):

```bash
cd out
now
```

## The idea behind the example

This example aims to show that Next.js can be used to create static sites that don't use any JavaScript.
