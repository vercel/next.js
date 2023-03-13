---
description: Next.js will automatically use HTTP Keep-Alive by default. Learn more about how to disable HTTP Keep-Alive here.
---

# Disabling HTTP Keep-Alive

In Node.js versions prior to 18, Next.js automatically polyfills `fetch()` with [node-fetch](/docs/basic-features/supported-browsers-features#polyfills) and enables [HTTP Keep-Alive](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Keep-Alive) by default.

To disable HTTP Keep-Alive for all `fetch()` calls on the server-side, open `next.config.js` and add the `httpAgentOptions` config:

```js
module.exports = {
  httpAgentOptions: {
    keepAlive: false,
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
