# Minification disabled in production

#### Why This Error Occurred

When overriding `optimization.minimize` or `optimization.minimizer` incorrectly in `next.config.js`, this degrades performance of your application

#### Possible Ways to Fix It

This is not a bug in Next.js, it's related to the user adding a custom webpack config to `next.config.js` and modyfing `optimization.minimize` or `optimization.minimizer`. Solution would be:

```js
module.exports = {
  webpack: config => {
    config.optimization.minimize = true
    return config
  }
}
```
