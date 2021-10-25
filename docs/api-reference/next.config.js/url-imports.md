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
import { a, b, c } from 'https://example.com/modules/some/module.js'
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

## Examples

From skypack CDN:

```js
import confetti from 'https://cdn.skypack.dev/canvas-confetti'
import { useEffect } from 'react'

export default () => {
  useEffect(() => {
    confetti()
  })
  return <p>Hello</p>
}
```

Static image imports:

```js
import Image from 'next/image'
import logo from 'https://github.com/vercel/next.js/raw/canary/test/integration/production/public/vercel.png'

export default () => (
  <div>
    <Image src={logo} placeholder="blur" />
  </div>
)
```

URLs in CSS:

```css
.className {
  background: url('https://github.com/vercel/next.js/raw/canary/test/integration/production/public/vercel.png');
}
```

Asset imports:

```js
import Image from 'next/image'

const logo = new URL(
  'https://github.com/vercel/next.js/raw/canary/test/integration/production/public/vercel.png',
  import.meta.url
)

export default () => <div>{logo.pathname}</div>
```
