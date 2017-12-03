[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/with-universal-configuration)

# With universal configuration

## How to use

### Using `create-next-app`

Download [`create-next-app`](https://github.com/segmentio/create-next-app) to bootstrap the example:

```
npm i -g create-next-app
create-next-app --example with-universal-configuration with-universal-configuration-app
```

### Download manually

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/master | tar -xz --strip=2 next.js-master/examples/with-universal-configuration
cd with-universal-configuration
```

Install it and run:

```bash
npm install
npm run dev
```

Deploy it to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download))

```bash
now
```

## The idea behind the example

This example show how to set custom environment variables for your application based on NODE_ENV using [transform-define](https://github.com/FormidableLabs/babel-plugin-transform-define).

## Caveats

- Because a babel plugin is used the output is cached in `node_modules/.cache` by `babel-loader`. When modifying the configuration you will have to manually clear this cache to make changes visible. Alternately, you may skip caching for `babel-loader` as shown [here](https://github.com/zeit/next.js/issues/1103#issuecomment-279529809).
- This example sets the environment configuration at build time, meaning the same build might not be used in e.g. both staging and production. For a solution which sets the environment at runtime, see [here](https://github.com/zeit/next.js/issues/1488#issuecomment-289108931). 
