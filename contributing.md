# Contributing to Next.js

Our Commitment to Open Source can be found [here](https://zeit.co/blog/oss)

1. [Fork](https://help.github.com/articles/fork-a-repo/) this repository to your own GitHub account and then [clone](https://help.github.com/articles/cloning-a-repository/) it to your local device.
1. Install yarn: `npm install -g yarn`
1. Install the dependencies: `yarn`
1. Run `yarn run dev` to build and watch for code changes

## To run tests

Running all tests:

```
yarn testonly
```

Running a specific test suite inside of the `test/integration` directory:

```
yarn testonly --testPathPattern "production"
```

Running just one test in the `production` test suite:

```
yarn testonly --testPathPattern "production" -t "should allow etag header support"
```

## Running the integration test apps without running tests

```
./node_modules/.bin/next ./test/integration/basic
```

## Testing in your own app

Because of the way Node.js resolves modules the easiest way to test your own application is copying it into the `test` directory.

```
cp -r yourapp <next.js directory>/test/integration/yourapp
```

Make sure you remove `react` `react-dom` and `next` from `test/integration/yourapp/node_modules` as otherwise they will be overwritten.

```bash
rm -rf <next.js directory>/test/integration/yourapp/{react,react-dom,next,next-server}
```

Then run your app using:

```
./node_modules/.bin/next ./test/integration/yourapp
```
