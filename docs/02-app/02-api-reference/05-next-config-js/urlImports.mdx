---
title: urlImports
description: Configure Next.js to allow importing modules from external URLs (experimental).
---

{/* The content of this doc is shared between the app and pages router. You can use the `<PagesOnly>Content</PagesOnly>` component to add content that is specific to the Pages Router. Any shared content should not be wrapped in a component. */}

URL imports are an experimental feature that allows you to import modules directly from external servers (instead of from the local disk).

> **Warning**: This feature is experimental. Only use domains that you trust to download and execute on your machine. Please exercise
> discretion, and caution until the feature is flagged as stable.

To opt-in, add the allowed URL prefixes inside `next.config.js`:

```js filename="next.config.js"
module.exports = {
  experimental: {
    urlImports: ['https://example.com/assets/', 'https://cdn.skypack.dev'],
  },
}
```

Then, you can import modules directly from URLs:

```js
import { a, b, c } from 'https://example.com/assets/some/module.js'
```

URL Imports can be used everywhere normal package imports can be used.

## Security Model

This feature is being designed with **security as the top priority**. To start, we added an experimental flag forcing you to explicitly allow the domains you accept URL imports from. We're working to take this further by limiting URL imports to execute in the browser sandbox using the [Edge Runtime](/docs/app/api-reference/edge).

## Lockfile

When using URL imports, Next.js will create a `next.lock` directory containing a lockfile and fetched assets.
This directory **must be committed to Git**, not ignored by `.gitignore`.

- When running `next dev`, Next.js will download and add all newly discovered URL Imports to your lockfile
- When running `next build`, Next.js will use only the lockfile to build the application for production

Typically, no network requests are needed and any outdated lockfile will cause the build to fail.
One exception is resources that respond with `Cache-Control: no-cache`.
These resources will have a `no-cache` entry in the lockfile and will always be fetched from the network on each build.

## Examples

### Skypack

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

### Static Image Imports

```js
import Image from 'next/image'
import logo from 'https://example.com/assets/logo.png'

export default () => (
  <div>
    <Image src={logo} placeholder="blur" />
  </div>
)
```

### URLs in CSS

```css
.className {
  background: url('https://example.com/assets/hero.jpg');
}
```

### Asset Imports

```js
const logo = new URL('https://example.com/assets/file.txt', import.meta.url)

console.log(logo.pathname)

// prints "/_next/static/media/file.a9727b5d.txt"
```
