# Missing webpack config

#### Why This Error Occurred

The value returned from the custom `webpack` function in your `next.config.js` was undefined. This can occur from the initial config value not being returned.

#### Possible Ways to Fix It

Make sure to return the `webpack` config from your custom `webpack` function in your `next.config.js`

```js
// next.config.js

module.exports = {
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    // Note: we provide webpack above so you should not `require` it
    // Perform customizations to webpack config
    config.plugins.push(new webpack.IgnorePlugin(/\/__tests__\//))

    // Important: return the modified config
    return config
  },
}
```

### Useful Links

- [Custom webpack config Documentation](https://nextjs.org/docs/api-reference/next.config.js/custom-webpack-config)
