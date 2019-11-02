# Static Optimization Indicator

When a page qualifies for [Automatic Static Optimization](https://www.notion.so/zeithq/Automatic-Static-Optimization-172e00fb49b548f9ab196a5bf754ca2d) we show an indicator to let you know.

This is helpful since automatic static optimization can be very beneficial and knowing immediately in development if the page qualifies can be useful.

In some cases this indicator might not be useful, like when working on electron applications. To remove it open `next.config.js` and disable the `autoPrerender` config in `devIndicators`:

```js
module.exports = {
  devIndicators: {
    autoPrerender: false,
  },
}
```
