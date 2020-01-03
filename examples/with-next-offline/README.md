# next-offline example

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-next-offline with-next-offline-app
# or
yarn create next-app --example with-next-offline with-next-offline-app
```

### Download

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-next-offline
cd with-next-offline
```

### Install dependecies

```bash
npm install
# or
yarn
```

### Build

#### Static export

```bash
npm run export
# or
yarn export
```

To serve it yourself, you can run:

```bash
npx serve -s out
```

#### Server hosted

```bash
npm run build
# or
yarn build
```

To serve it yourself, run:

```bash
npm start
# or
yarn start
```

### Deploy

Deploy it to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download))

```bash
now
```

## The idea behind the example

This example demonstrates how to use the [next-offline plugin](https://github.com/hanford/next-offline) It includes manifest.json to install app via chrome
