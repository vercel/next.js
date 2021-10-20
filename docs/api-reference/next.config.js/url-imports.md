---
description: Configure Next.js to allow importing modules from external URLs.
---

# URL imports

URL imports is an opt-in feature which allows to import modules directly from externals servers (instead of from the local disk).

To opt-in specify the allowed URL prefixes in the next.config.js:

```js
module.exports = {
  experimental: {
    urlImports: ['https://example.com/modules/'],
  },
}
```

With that config it's now possible to import modules like that:

```js
import { a, b, c } from 'https://example.com/modules/'
```

URL imports can be used everywhere where normal imports can be used too.
Note that even modules from Npm or other modules imported from URLs can use url import.
That's why it's important to restrict access to trusted URLs.

## Lockfile

When using URL imports Next.js will create a lockfile in a `next.lock` directory.
All files in that directory are intended to be committed to the version controlling system.

When running `next dev` Next.js will download and add all new discovered URL imports to the lockfile.

When running `next build` Next.js will use only the lockfile to build the application.
Usually no network requests will be made and any outdated lockfile will cause the build to fail.

There is an expection for resources that respond with `Cache-Control: no-cache`.
These resources will have a `no-cache` entry in the lockfile and will always be fetched from network on each build.
