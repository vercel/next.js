# `Head` or `NextScript` attribute `crossOrigin` is deprecated

#### Why This Error Occurred

This option has been moved to `next.config.js`.

#### Possible Ways to Fix It

Add the config option:

```js
// next.config.js
module.exports = {
  crossOrigin: 'anonymous'
}
```

### Useful Links

- [The issue this was reported in: #5674](https://github.com/zeit/next.js/issues/5674)
