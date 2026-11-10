---
title: turbopack.ignoreIssue
description: Suppress specific Turbopack errors and warnings from the CLI output and error overlay.
related:
  title: Next Steps
  description: Learn more about Turbopack configuration.
  links:
    - app/api-reference/config/next-config-js/turbopack
    - app/api-reference/turbopack
---

The `turbopack.ignoreIssue` option allows you to filter out specific [Turbopack](/docs/app/api-reference/turbopack) errors and warnings so they do not appear in the CLI output or the error overlay. This is useful for suppressing known warnings that do not affect your application, such as intentionally unresolved optional dependencies.

This option is only available when using Turbopack (`next dev --turbopack`).

## Usage

```ts filename="next.config.ts" switcher
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  turbopack: {
    ignoreIssue: [
      {
        path: '**/vendor/**',
      },
    ],
  },
}

export default nextConfig
```

```js filename="next.config.js" switcher
/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    ignoreIssue: [
      {
        path: '**/vendor/**',
      },
    ],
  },
}

module.exports = nextConfig
```

## Options

Each rule in the `ignoreIssue` array is an object with the following fields:

| Field                         | Type               | Required | Description                                |
| ----------------------------- | ------------------ | -------- | ------------------------------------------ |
| [`path`](#path)               | `string \| RegExp` | Yes      | Matches against the file path of the issue |
| [`title`](#title)             | `string \| RegExp` | No       | Matches against the issue title            |
| [`description`](#description) | `string \| RegExp` | No       | Matches against the issue description      |

An issue is suppressed when it matches the `path` **and** all other specified fields in a rule. If only `path` is provided, any issue from a matching file is suppressed.

> **Good to know:** Issue titles and descriptions may change between Turbopack versions. The `path` field is generally stable, but is not guaranteed to remain consistent for all issue types. When possible, prefer using more specific `path` patterns over `title` or `description` matching.

### `path`

A **glob pattern** (when a string) or **regular expression** that matches against the file path where the issue originated.

```js filename="next.config.js"
module.exports = {
  turbopack: {
    ignoreIssue: [
      // Glob pattern: suppress issues from any file under vendor/
      { path: '**/vendor/**' },
      // RegExp: suppress issues from files matching a pattern
      { path: /node_modules\/legacy-lib/ },
    ],
  },
}
```

### `title`

An **exact string match** (when a string) or **regular expression** that matches against the issue title.

```js filename="next.config.js"
module.exports = {
  turbopack: {
    ignoreIssue: [
      {
        path: '**/src/**',
        title: 'Module not found',
      },
    ],
  },
}
```

### `description`

An **exact string match** (when a string) or **regular expression** that matches against the issue description.

```js filename="next.config.js"
module.exports = {
  turbopack: {
    ignoreIssue: [
      {
        path: '**/src/**',
        description: /Cannot find module 'optional-dep'/,
      },
    ],
  },
}
```

## Examples

### Suppressing warnings for optional dependencies

If your code uses `try/catch` around an optional `require()` call, Turbopack may report a "Module not found" warning. You can suppress it:

```ts filename="next.config.ts" switcher
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  turbopack: {
    ignoreIssue: [
      {
        path: '**/lib/optional-feature/**',
        title: 'Module not found',
      },
    ],
  },
}

export default nextConfig
```

```js filename="next.config.js" switcher
/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    ignoreIssue: [
      {
        path: '**/lib/optional-feature/**',
        title: 'Module not found',
      },
    ],
  },
}

module.exports = nextConfig
```

### Combining multiple rules

You can specify multiple rules to suppress different issues:

```js filename="next.config.js"
module.exports = {
  turbopack: {
    ignoreIssue: [
      { path: '**/vendor/**' },
      { path: '**/legacy/**', title: 'Module not found' },
      { path: /generated\//, description: /expected identifier/ },
    ],
  },
}
```

## Version History

| Version   | Changes                             |
| --------- | ----------------------------------- |
| `v16.2.0` | `turbopack.ignoreIssue` introduced. |
