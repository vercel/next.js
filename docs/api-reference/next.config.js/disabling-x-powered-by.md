---
description: Next.js will add `x-powered-by` to the request headers by default. Learn to opt-out of it here.
---

# Disabling x-powered-by

By default Next.js will add `x-powered-by` to the request headers. To opt-out of it, open `next.config.js` and disable the `poweredByHeader` config:

```js
module.exports = {
  poweredByHeader: false,
}
```

## Related

<div class="card">
  <a href="/docs/api-reference/next.config.js/introduction.md">
    <b>Introduction to next.config.js:</b>
    <small>Learn more about the configuration file used by Next.js.</small>
  </a>
</div>
