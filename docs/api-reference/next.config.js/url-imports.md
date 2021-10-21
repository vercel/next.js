---
description: Configure Next.js to allow importing modules from external URLs.
---

# URL imports

URL Imports are an experimental feature that allows you to import modules directly from external servers (instead of from the local disk).

To opt-in, add the allowed URL prefixes inside `next.config.js`:

```js
module.exports = {
  experimental: {
    urlImports: ['https://example.com/modules/'],
  },
}
```

Then, you can import modules directly from URLs:

```js
import { a, b, c } from 'https://example.com/modules/'
```

URL Imports can be used everywhere normal package imports can be used.

## Lockfile

When using URL imports, Next.js will create a lockfile in the `next.lock` directory.
This directory is intended to be committed to Git and should **not be included** in your `.gitignore` file.

- When running `next dev`, Next.js will download and add all newly discovered URL Imports to your lockfile
- When running `next build`, Next.js will use only the lockfile to build the application for production

Typically, no network requests are needed and any outdated lockfile will cause the build to fail.
One exception is resources that respond with `Cache-Control: no-cache`.
These resources will have a `no-cache` entry in the lockfile and will always be fetched from the network on each build.
