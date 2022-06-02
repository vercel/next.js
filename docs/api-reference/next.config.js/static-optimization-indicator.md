---
description: Optimized pages include an indicator to let you know if it's being statically optimized. You can opt-out of it here.
---

# Static Optimization Indicator

> **Note:** This indicator was removed in Next.js version 10.0.1. We recommend upgrading to the latest version of Next.js.

When a page qualifies for [Automatic Static Optimization](/docs/advanced-features/automatic-static-optimization.md) we show an indicator to let you know.

This is helpful since automatic static optimization can be very beneficial and knowing immediately in development if the page qualifies can be useful.

In some cases this indicator might not be useful, like when working on electron applications. To remove it open `next.config.js` and disable the `autoPrerender` config in `devIndicators`:

```js
module.exports = {
  devIndicators: {
    autoPrerender: false,
  },
}
```
