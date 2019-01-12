[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/with-universal-configuration-build-time)

# With universal configuration

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/segmentio/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-universal-configuration-build-time with-universal-configuration-build-time-app
# or
yarn create next-app --example with-universal-configuration-build-time with-universal-configuration-build-time-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-universal-configuration-build-time
cd with-universal-configuration-build-time
```

Install it and run:

```bash
npm install
VARIABLE_EXAMPLE=next.js npm run dev
# or
yarn
VARIABLE_EXAMPLE=next.js yarn dev
```

Deploy it to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download))

```bash
now
```

## The idea behind the example

This example shows how to use environment variables and customize one based on NODE_ENV for your application using [transform-define](https://github.com/FormidableLabs/babel-plugin-transform-define)

When you build your application the environment variable is transformed into a primitive (string or undefined) and can only be changed with a new build. This happens for both client-side and server-side. If the environment variable is used directly in your application it will only have an effect on the server side, not the client side.

To set the environment variables in runtime you can follow the example [with-universal-configuration-runtime]((https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/with-universal-configuration-runtime))

## Caveats

- Because a babel plugin is used the output is cached in `node_modules/.cache` by `babel-loader`. When modifying the configuration you will have to manually clear this cache to make changes visible. Alternately, you may skip caching for `babel-loader` as shown [here](https://github.com/zeit/next.js/issues/1103#issuecomment-279529809).
- This example sets the environment configuration at build time, meaning the same build might not be used in e.g. both staging and production. For a solution which sets the environment at runtime, see [here](https://github.com/zeit/next.js/issues/1488#issuecomment-289108931).
