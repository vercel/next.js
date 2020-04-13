---
description: Set a custom `pages` directory by adding a `pagesDir` property to your `next.config.js` file.
---

# Custom Pages Directory

If you would like to further customize your `pages` directory path outside of `pages` and `src/pages`, you can also set a custom `pages` directory via your `next.config.js` file.

# Example - `next.config.js`

```
const path = require('path')

module.exports = {
  pagesDir: path.join(__dirname, 'src/universal/page-components'),
}

```

## Related

For more information on what to do next, we recommend the following sections:

<div class="card">
  <a href="/docs/basic-features/pages.md">
    <b>Pages:</b>
    <small>Learn more about what pages are in Next.js</small>
  </a>
</div>
