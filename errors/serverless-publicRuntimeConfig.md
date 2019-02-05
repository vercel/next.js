# Using `publicRuntimeConfig` with `target` set to `serverless`

#### Why This Error Occurred

Due to the way that Next.js seperates pages into their own lambdas, `publicRuntimeConfig` will not function when `target` is set to `serverless`.

#### Possible Ways to Fix It

Use config option `buildVars` to set build time variables like such:

```js
// next.config.js
module.exports = {
  buildVars: {
    'process.special': "'value'"
  }
}
```
