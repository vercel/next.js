# `webpack.entry` is not an object

#### Why This Error Occurred

Next.js uses multiple entrypoints inside, if `entry` is not an object it will break the `build` process.

#### Possible Ways to Fix It

Add new entries instead of replacing the default entry.

```js
// next.config.js
module.exports = {
  webpack(config) {
    Object.assign(config.entry, {
      // custom entries
    })
    return config
  }
}
```
