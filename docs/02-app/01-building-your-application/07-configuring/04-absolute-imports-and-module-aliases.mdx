---
title: Absolute Imports and Module Path Aliases
description: Configure module path aliases that allow you to remap certain import paths.
---

{/* The content of this doc is shared between the app and pages router. You can use the `<PagesOnly>Content</PagesOnly>` component to add content that is specific to the Pages Router. Any shared content should not be wrapped in a component. */}

<details>
  <summary>Examples</summary>

- [Absolute Imports and Aliases](https://github.com/vercel/next.js/tree/canary/examples/with-absolute-imports)

</details>

Next.js has in-built support for the `"paths"` and `"baseUrl"` options of `tsconfig.json` and `jsconfig.json` files.

These options allow you to alias project directories to absolute paths, making it easier to import modules. For example:

```tsx
// before
import { Button } from '../../../components/button'

// after
import { Button } from '@/components/button'
```

> **Good to know**: `create-next-app` will prompt to configure these options for you.

## Absolute Imports

The `baseUrl` configuration option allows you to import directly from the root of the project.

An example of this configuration:

```json filename="tsconfig.json or jsconfig.json"
{
  "compilerOptions": {
    "baseUrl": "."
  }
}
```

```tsx filename="components/button.tsx" switcher
export default function Button() {
  return <button>Click me</button>
}
```

```jsx filename="components/button.js" switcher
export default function Button() {
  return <button>Click me</button>
}
```

```tsx filename="app/page.tsx" switcher
import Button from 'components/button'

export default function HomePage() {
  return (
    <>
      <h1>Hello World</h1>
      <Button />
    </>
  )
}
```

```jsx filename="app/page.js" switcher
import Button from 'components/button'

export default function HomePage() {
  return (
    <>
      <h1>Hello World</h1>
      <Button />
    </>
  )
}
```

## Module Aliases

In addition to configuring the `baseUrl` path, you can use the `"paths"` option to "alias" module paths.

For example, the following configuration maps `@/components/*` to `components/*`:

```json filename="tsconfig.json or jsconfig.json"
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/components/*": ["components/*"]
    }
  }
}
```

```tsx filename="components/button.tsx" switcher
export default function Button() {
  return <button>Click me</button>
}
```

```jsx filename="components/button.js" switcher
export default function Button() {
  return <button>Click me</button>
}
```

```tsx filename="app/page.tsx" switcher
import Button from '@/components/button'

export default function HomePage() {
  return (
    <>
      <h1>Hello World</h1>
      <Button />
    </>
  )
}
```

```jsx filename="app/page.js" switcher
import Button from '@/components/button'

export default function HomePage() {
  return (
    <>
      <h1>Hello World</h1>
      <Button />
    </>
  )
}
```

Each of the `"paths"` are relative to the `baseUrl` location. For example:

```json
// tsconfig.json or jsconfig.json
{
  "compilerOptions": {
    "baseUrl": "src/",
    "paths": {
      "@/styles/*": ["styles/*"],
      "@/components/*": ["components/*"]
    }
  }
}
```

```jsx
// pages/index.js
import Button from '@/components/button'
import '@/styles/styles.css'
import Helper from 'utils/helper'

export default function HomePage() {
  return (
    <Helper>
      <h1>Hello World</h1>
      <Button />
    </Helper>
  )
}
```
