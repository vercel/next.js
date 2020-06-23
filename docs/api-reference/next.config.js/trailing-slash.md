---
description: Configure Next.js pages to resolve with or without a trailing slash.
---

# Trailing Slash

> **Warning**: This feature is **experimental and may not work as expected**.
> You must enable the `trailingSlash` experimental option to try it.

By default Next.js will redirect urls with trailing slashes to their counterpart without a trailing slash. For example `/about/` will redirect to `/about`. You can configure this behavior to act the opposite way, where urls without trailing slashes are redirected to their counterparts with trailing slashes.

Open `next.config.js` and add the `trailingSlash` config:

```js
module.exports = {
  experimental: {
    trailingSlash: true,
  },
}
```

With this option set, urls like `/about` will redirect to `/about/`.

## Related

<div class="card">
  <a href="/docs/api-reference/next.config.js/introduction.md">
    <b>Introduction to next.config.js:</b>
    <small>Learn more about the configuration file used by Next.js.</small>
  </a>
</div>
