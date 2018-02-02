[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/with-jest)
# Example app with jest tests

## How to use

### Using `create-next-app`

Download [`create-next-app`](https://github.com/segmentio/create-next-app) to bootstrap the example:

```
npm i -g create-next-app
create-next-app --example with-jest with-jest-app
```

### Download manually

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-jest
cd with-jest
```

Install it and test:

```bash
npm install
npm test
```

## The idea behind the example

This example features:

* An app with jest tests

> A very important part of this example is the `.babelrc` file which configures the `test` environment to use `babel-preset-env` and configures it to transpile modules to `commonjs`). [Learn more](https://github.com/zeit/next.js/issues/2895).
