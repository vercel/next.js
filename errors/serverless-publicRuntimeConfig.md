# Using `publicRuntimeConfig` or `serverRuntimeConfig` with `target` set to `serverless`

#### Why This Error Occurred

In the `serverless` target environment `next.config.js` is not loaded, so we don't support `publicRuntimeConfig` or `serverRuntimeConfig`.

#### Possible Ways to Fix It

Use config option `env` to set **build time** variables like such:

```js
// next.config.js
module.exports = {
  env: {
    special: 'value',
  },
}
```

```js
// pages/index.js
console.log(process.env.special) // value
```
