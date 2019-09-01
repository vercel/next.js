# Using `publicRuntimeConfig` with `target` set to `serverless`

#### Why This Error Occurred

In the `serverless` target environment `next.config.js` is not loaded, so we don't support `publicRuntimeConfig`.

#### Possible Ways to Fix It

- Use config option `env` to set **build time** variables like such:

```js
// next.config.js
module.exports = {
  env: {
    special: 'value',
  },
}
```

- If you are trying to do a serverless deployment, set `publicRuntimeConfig` explicitly as `false`:

```js
// next.config.js
module.exports = {
  target: 'serverless',
  publicRuntimeConfig: false, // publicRuntimeConfig is an object by default so it passes a boolean check, so needs to be set as false.
}
```

```js
// pages/index.js
console.log(process.env.special) // value
```
