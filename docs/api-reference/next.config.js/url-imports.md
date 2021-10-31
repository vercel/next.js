---
description: Configure Next.js to allow importing modules from external URLs (experimental).
---

# URL Imports

URL imports are an experimental feature that allows you to import modules directly from external servers (instead of from the local disk).

> **Warning**: This feature is experimental. Only use domains that you trust to download and execute on your machine. Please exercise
> discretion, and caution until the feature is flagged as stable.

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

## Security Model

This feature is being designed with **security as the top priority**. To start, we added an experimental flag forcing you to explicitly allow the domains you accept URL imports from. We're working to take this further by limiting URL imports to execute in the browser sandbox using the [Edge Runtime](/docs/api-reference/edge-runtime.md). This runtime is used by [Middleware](/docs/middleware.md) as well as [Next.js Live](https://vercel.com/live).

## Lockfile

When using URL imports, Next.js will create a lockfile in the `next.lock` directory.
This directory is intended to be committed to Git and should **not be included** in your `.gitignore` file.

- When running `next dev`, Next.js will download and add all newly discovered URL Imports to your lockfile
- When running `next build`, Next.js will use only the lockfile to build the application for production

Typically, no network requests are needed and any outdated lockfile will cause the build to fail.
One exception is resources that respond with `Cache-Control: no-cache`.
These resources will have a `no-cache` entry in the lockfile and will always be fetched from the network on each build.

## Examples

#### Skypack

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

#### Static Image Imports

```js
import Image from 'next/image'
import logo from 'https://github.com/vercel/next.js/raw/canary/test/integration/production/public/vercel.png'

export default () => (
  <div>
    <Image src={logo} placeholder="blur" />
  </div>
)
```

#### URLs in CSS

```css
.className {
  background: url('https://github.com/vercel/next.js/raw/canary/test/integration/production/public/vercel.png');
}
```

#### Asset Imports

```js
import Image from 'next/image'

const logo = new URL(
  'https://github.com/vercel/next.js/raw/canary/test/integration/production/public/vercel.png',
  import.meta.url
)

export default () => <div>{logo.pathname}</div>
```
