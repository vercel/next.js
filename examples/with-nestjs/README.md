[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/with-nestjs)

# TypeScript Next.js example

This is a really simple project that show the usage of Next.js with TypeScript.

## How to use it?

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/segmentio/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-nestjs with-nestjs-app
# or
yarn create next-app --example with-nestjs with-nestjs-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-nestjs
cd with-nestjs
```

Install it and run:

```bash
npm i
npm run dev
# or
yarn
yarn dev
```

## The idea behind the example

Use the [@zeit/next-typescript](https://github.com/zeit/next-plugins/tree/master/packages/next-typescript) plugin to inject [@babel/preset-typescript](https://github.com/babel/babel/tree/master/packages/babel-preset-typescript) into Next.js, allowing for fast TypeScript transpilation. It also implements a `tsconfig.json` as recommended by [the @zeit/next-typescript plugin page](https://github.com/zeit/next-plugins/tree/master/packages/next-typescript/#readme).

Use the [nest-next](https://www.npmjs.com/package/nest-next) package to allow use of [Nest.JS](https://nestjs.com/) as backend of our application.

A `type-check` script is also added to `package.json`, which runs TypeScript's `tsc` CLI in `noEmit` mode to run type-checking separately. You can then include this in your `test` scripts, say, for your CI process.
