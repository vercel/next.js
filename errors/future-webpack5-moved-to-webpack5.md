# `future.webpack5` has been moved to `webpack5`

#### Why This Error Occurred

The `future.webpack5` option has been moved to `webpack5` in `next.config.js`.

#### Possible Ways to Fix It

If you had the value `true` you can remove the option as webpack 5 is now the default for all Next.js apps unless opted out.

If you had the value `false` you can update `next.config.js`:

Change `future.webpack5` to `webpack5`.

Current `next.config.js`:

```js
// next.config.js
module.exports = {
  future: {
    webpack5: false,
  },
}
```

Updated `next.config.js`:

```js
// next.config.js
module.exports = {
  webpack5: false,
}
```
