---
title: turbopackLocalPostcssConfig
description: Enable per-directory PostCSS config resolution in Turbopack so that the config closest to each CSS file takes precedence over the project root config.
---

The `turbopackLocalPostcssConfig` option changes how Turbopack resolves `postcss.config.js` files. When enabled, Turbopack searches for the config starting from the CSS file's own directory first, then falls back to the project root. By default, Turbopack checks the project root first, meaning a root-level `postcss.config.js` always takes precedence over configs in subdirectories.

This option is only relevant when using Turbopack (`next dev` or `next build`).

## Usage

```ts filename="next.config.ts" switcher
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    turbopackLocalPostcssConfig: true,
  },
}

export default nextConfig
```

```js filename="next.config.js" switcher
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    turbopackLocalPostcssConfig: true,
  },
}

module.exports = nextConfig
```

## Behavior

| Setting           | Config resolution order             |
| ----------------- | ----------------------------------- |
| `false` (default) | Project root → CSS file's directory |
| `true`            | CSS file's directory → project root |

With the default behavior, a `postcss.config.js` at the project root is used for all CSS files, and per-directory configs are only applied if no root config exists. Enabling `turbopackLocalPostcssConfig` reverses this: per-directory configs take precedence, and the root config serves as the fallback.

## Example

This is useful for projects that need different PostCSS transforms in different directories, such as a monorepo with multiple apps or design system packages:

```
my-app/
├── postcss.config.js          ← fallback (applied if no local config is found)
├── app/
│   └── page.module.css        ← uses root config
└── packages/
    └── ui/
        ├── postcss.config.js  ← takes precedence for files in this directory
        └── button.module.css  ← uses packages/ui/postcss.config.js
```

## Version History

| Version   | Changes                                   |
| --------- | ----------------------------------------- |
| `v16.3.0` | `turbopackLocalPostcssConfig` introduced. |
