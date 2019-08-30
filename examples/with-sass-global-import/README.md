# Example app with sass global imports

#Purpose:

Nextjs doesnt let you use sass global variables directly

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/segmentio/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-next-sass-global-import with-next-sass-global-import
# or
yarn create next-app --example with-next-sass-global-import with-next-sass-global-import
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-next-sass-global-import
cd with-next-sass-global-import
```

Install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

Run production build with:

```bash
npm run build
npm run start
# or
yarn build
yarn start
```

## The idea behind the example

- An app with next-sass and sass-resources-loader to gloabally access the variables in sass

This example uses next-sass with sass-resources-loader . The config can be found in `next.config.js`
