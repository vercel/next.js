# Invalid assetPrefix

#### Why This Error Occurred

The value of `assetPrefix` in `next.config.js` is set to something that is not a `string`.

#### Possible Ways to Fix It

Ensure that `assetPrefix` is a `string`.

Example:

```js
module.exports = {
  assetPrefix: '/',
}
```
