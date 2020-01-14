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
