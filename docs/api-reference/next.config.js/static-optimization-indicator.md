---
description: Optimized pages include an indicator to let you know if it's being statically optimized. You can opt-out of it here.
---

# Static Optimization Indicator

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

## Related

<div class="card">
  <a href="/docs/api-reference/next.config.js/introduction.md">
    <b>Introduction to next.config.js:</b>
    <small>Learn more about the configuration file used by Next.js.</small>
  </a>
</div>

<div class="card">
  <a href="/docs/advanced-features/automatic-static-optimization.md">
    <b>Automatic Static Optimization:</b>
    <small>Next.js automatically optimizes your app to be static HTML whenever possible. Learn how it works here.</small>
  </a>
</div>
