[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/with-jest)
# Example app with jest tests

## How to use

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/master | tar -xz --strip=2 next.js-master/examples/with-jest
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
