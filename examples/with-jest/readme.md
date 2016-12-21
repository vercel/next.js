# Add testing to your `next` app using `jest`

## How to use

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/master | tar -xz next.js-master/examples/with-jest
cd next.js-master/examples/with-jest
```

or clone the repo:

```bash
git clone git@github.com:zeit/next.js.git --depth=1
cd next.js/examples/with-jest
```

Install the dependencies:

```bash
npm install
```

Run the tests:

```bash
npm test
```

## The idea behind the example

[`jest`](https://facebook.github.io/jest/) is a testing framework for `react`. In this example we show how to use `jest` to do DOM-testing for react applications in `next`

`npm install --save-dev jest babel-jest enzyme`

 * `jest` - The testing framework
 * `babel-jest` - Babel preprocessor for test files
 * `enzyme` - Mock render the elements

Add test script to the [recommended `package.json`](https://github.com/zeit/next.js#production-deployment)

__package.json__

```javascript
...
"scripts": {
    "test": "jest",
    ...
}
...

```
