---
title: useServerInsertedHTML
description: API Reference for the useServerInsertedHTML hook.
related:
  title: Next Steps
  description: Learn more about the features mentioned in this page by reading the API Reference.
  links:
    - app/guides/css-in-js
    - app/getting-started/server-and-client-components
    - app/guides/server-and-client-boundary
---

The `useServerInsertedHTML` hook lets a **Client Component** inject markup into the HTML document Next.js generates, from anywhere in the tree. It works in the App Router only and does nothing if called in the Pages Router.

The nodes you return are rendered separately from your page, and inserted into the HTML as Next.js generates it. The hook exists for CSS-in-JS style registries, which collect the rules produced during a render and flush them into the document ahead of the markup that uses them.

```tsx filename="app/registry.tsx" switcher
'use client'

import { useState } from 'react'
import { useServerInsertedHTML } from 'next/navigation'
import { StyleRegistry, createStyleRegistry } from 'styled-jsx'

export default function StyledJsxRegistry({
  children,
}: {
  children: React.ReactNode
}) {
  const [registry] = useState(() => createStyleRegistry())

  useServerInsertedHTML(() => {
    const styles = registry.styles()
    registry.flush()
    return <>{styles}</>
  })

  return <StyleRegistry registry={registry}>{children}</StyleRegistry>
}
```

```jsx filename="app/registry.js" switcher
'use client'

import { useState } from 'react'
import { useServerInsertedHTML } from 'next/navigation'
import { StyleRegistry, createStyleRegistry } from 'styled-jsx'

export default function StyledJsxRegistry({ children }) {
  const [registry] = useState(() => createStyleRegistry())

  useServerInsertedHTML(() => {
    const styles = registry.styles()
    registry.flush()
    return <>{styles}</>
  })

  return <StyleRegistry registry={registry}>{children}</StyleRegistry>
}
```

See [How to use CSS-in-JS libraries](/docs/app/guides/css-in-js) for the full setup, including `styled-components`.

## Parameters

```tsx
useServerInsertedHTML(callback: () => React.ReactNode)
```

| Parameter  | Type                    | Description                                                   |
| ---------- | ----------------------- | ------------------------------------------------------------- |
| `callback` | `() => React.ReactNode` | Returns the nodes to insert into the generated HTML document. |

## Returns

The hook does not return a value.

## Behavior

### The callback runs once per flush

Next.js flushes the document in chunks as your tree suspends and resolves, and every registered callback runs on every flush, not once per render. A single component can therefore have its callback invoked several times, so keep it free of side effects.

The callback runs whenever Next.js produces an HTML document, on a direct navigation and during any prerender.

Content inserted before the `<head>` is sent goes into `<head>`. Anything inserted later goes into `<body>`. In this example, `Header` and `Feed` are styled with a CSS-in-JS library, so the registry collects their CSS rules as they render.

```tsx filename="app/page.tsx"
import { Suspense } from 'react'
import { Header } from './header'
import { Feed } from './feed'

export default function Page() {
  return (
    <>
      {/* Renders before the head closes, so its CSS rules go into <head>. */}
      <Header />
      <Suspense fallback={<p>Loading feed</p>}>
        {/* Resolves after the head is closed, so its CSS rules go into <body>. */}
        <Feed />
      </Suspense>
    </>
  )
}
```

This assumes nothing above `Header` suspends. If something does, `Header` renders after the head has closed and its CSS rules go into `<body>` as well.

In the style registry pattern above, `styled-jsx` collects the CSS rules it finds as your tree renders. On each flush the callback returns the rules gathered so far and clears the registry, so the next one carries only what was found since. Return the same nodes every time instead and the document ends up with one copy of them per flush.

Style registries work because a `<style>` tag applies to the whole document wherever it ends up.

On a client navigation this hook does nothing. Your CSS-in-JS library injects rules in the browser itself, so styles still apply to components rendered after a transition.

### Prefer other options for inline scripts

Prefer declaring inline scripts in React Server Components, as shown in [Preventing a flash before hydration](/docs/app/guides/preventing-flash-before-hydration). The hook is for nodes that support the tree being rendered, such as the `<style>` tags a CSS-in-JS registry collects as it renders.

A script is included in `<head>` only while nothing above it has suspended, so a change to the tree can move it into `<body>` with no error.

If you use the hook, guard the callback with a `useRef` flag so the script is inserted once, not on every flush. Neither a script returned from the hook nor an inline script written in JSX runs on a client navigation, so both only suit preventing a flash of unstyled content or other one-time side effects. React logs a warning in development for a script written in JSX, while the hook skips it silently.

Next.js does not add a [nonce](/docs/app/guides/content-security-policy) to a script you return. Under a `script-src` policy that requires one, the browser blocks it.
