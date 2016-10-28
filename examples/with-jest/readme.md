## Add testing to your `next` app using `jest`

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

`npm run test`
