---
description: In development mode, pages include an indicator to let you know if your new code it's being compiled. You can opt-out of it here.
---

# Build indicator

> **Note:** This indicator is only present in development mode and will not appear when building and running the app in production mode.

When you edit your code, and Next.js is compiling the application, a compilation indicator appears in the bottom right corner of the page.

In some cases this indicator can be misplaced in your page, like when conflicting with a chat launcher. To change its position, open `next.config.js` and choose between `left` or `right` in the `buildActivity` config in `buildActivityPosition`:

```js
module.exports = {
  devIndicators: {
    buildActivityPosition: 'left',
  },
}
```

In some cases this indicator might not be useful for you. To remove it, open `next.config.js` and disable the `buildActivity` config in `devIndicators`:

```js
module.exports = {
  devIndicators: {
    buildActivity: false,
  },
}
```
