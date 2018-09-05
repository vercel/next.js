[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/with-universal-configuration)

# With universal runtime configuration

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/segmentio/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-universal-configuration-runtime with-universal-configuration-runtime-app
# or
yarn create next-app --example with-universal-configuration-runtime with-universal-configuration-runtime-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-universal-configuration-runtime
cd with-universal-configuration-runtime
```

Install it and run:

```bash
npm install
API_URL='https://example.com' npm run dev
# or
yarn
API_URL='https://example.com' yarn dev
```

Deploy it to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download))

```bash
now
```

## The idea behind the example

This example show how to set custom environment variables for your application at runtime using the `publicRuntimeConfig` key in `next.config.js`

For documentation see: https://github.com/zeit/next.js#exposing-configuration-to-the-server--client-side
