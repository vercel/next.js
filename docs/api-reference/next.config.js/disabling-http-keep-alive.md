---
description: Next.js will automatically use HTTP Keep-Alive by default. Learn more about how to disable HTTP Keep-Alive here.
---

# Disabling HTTP Keep-Alive

Next.js automatically polyfills [node-fetch](/docs/basic-features/supported-browsers-features#polyfills) and enables [HTTP Keep-Alive](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Keep-Alive) by default. You may want to disable HTTP Keep-Alive for certain `fetch()` calls or globally.

For a single `fetch()` call, you can add the agent option:

```js
import { Agent } from 'https'

const url = 'https://example.com'
const agent = new Agent({ keepAlive: false })
fetch(url, { agent })
```

To override all `fetch()` calls globally, you can use `next.config.js`:

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
