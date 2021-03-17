# Promise In Next Config

#### Why This Error Occurred

The webpack function in `next.config.js` returned a promise which is not supported in Next.js. For example, below is not supported:

```js
module.exports = {
  webpack: async function (config) {
    return config
  },
}
```

#### Possible Ways to Fix It

Check your `next.config.js` for `async` or `return Promise`

Potentially a plugin is returning a `Promise` from the webpack function.
