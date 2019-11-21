# Carlo example

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-carlo with-carlo-app
# or
yarn create next-app --example with-carlo with-carlo-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-carlo
cd with-carlo
```

### Development

Install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

### Build it

```bash
npm run build
npm start
```

## The idea behind the example

This example show how you can use Next.js with [Carlo](https://github.com/GoogleChromeLabs/carlo). Here we use a [Custom server](https://github.com/zeit/next.js/blob/canary/examples/custom-server/README.md) to fit the carlo configs.
