---
title: generateViewport
description: API Reference for the generateViewport function.
related:
  title: Next Steps
  description: View all the Metadata API options.
  links:
    - app/api-reference/file-conventions/metadata
---

You can customize the initial viewport of the page with the static `viewport` object or the dynamic `generateViewport` function.

> **Good to know**:
>
> - The `viewport` object and `generateViewport` function exports are **only supported in Server Components**.
> - You cannot export both the `viewport` object and `generateViewport` function from the same route segment.
> - If you're coming from migrating `metadata` exports, you can use [metadata-to-viewport-export codemod](/docs/app/guides/upgrading/codemods#metadata-to-viewport-export) to update your changes.

## The `viewport` object

To define the viewport options, export a `viewport` object from a `layout.jsx` or `page.jsx` file.

```tsx filename="layout.tsx | page.tsx" switcher
import type { Viewport } from 'next'

export const viewport: Viewport = {
  themeColor: 'black',
}

export default function Page() {}
```

```jsx filename="layout.jsx | page.jsx" switcher
export const viewport = {
  themeColor: 'black',
}

export default function Page() {}
```

## `generateViewport` function

`generateViewport` should return a [`Viewport` object](#viewport-fields) containing one or more viewport fields.

```tsx filename="layout.tsx | page.tsx" switcher
export function generateViewport({ params }) {
  return {
    themeColor: '...',
  }
}
```

In TypeScript, the `params` argument can be typed via [`PageProps<'/route'>`](/docs/app/api-reference/file-conventions/page#page-props-helper) or [`LayoutProps<'/route'>`](/docs/app/api-reference/file-conventions/layout#layout-props-helper) depending on where `generateViewport` is defined.

```jsx filename="layout.js | page.js" switcher
export function generateViewport({ params }) {
  return {
    themeColor: '...',
  }
}
```

> **Good to know**:
>
> - If the viewport doesn't depend on runtime information, it should be defined using the static [`viewport` object](#the-viewport-object) rather than `generateViewport`.

## Viewport Fields

### `themeColor`

Learn more about [`theme-color`](https://developer.mozilla.org/docs/Web/HTML/Element/meta/name/theme-color).

**Simple theme color**

```tsx filename="layout.tsx | page.tsx" switcher
import type { Viewport } from 'next'

export const viewport: Viewport = {
  themeColor: 'black',
}
```

```jsx filename="layout.jsx | page.jsx" switcher
export const viewport = {
  themeColor: 'black',
}
```

```html filename="<head> output" hideLineNumbers
<meta name="theme-color" content="black" />
```

**With media attribute**

```tsx filename="layout.tsx | page.tsx" switcher
import type { Viewport } from 'next'

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'cyan' },
    { media: '(prefers-color-scheme: dark)', color: 'black' },
  ],
}
```

```jsx filename="layout.jsx | page.jsx" switcher
export const viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'cyan' },
    { media: '(prefers-color-scheme: dark)', color: 'black' },
  ],
}
```

```html filename="<head> output" hideLineNumbers
<meta name="theme-color" media="(prefers-color-scheme: light)" content="cyan" />
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="black" />
```

### `width`, `initialScale`, `maximumScale` and `userScalable`

> **Good to know**: The `viewport` meta tag is automatically set, and manual configuration is usually unnecessary as the default is sufficient. However, the information is provided for completeness.

```tsx filename="layout.tsx | page.tsx" switcher
import type { Viewport } from 'next'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // Also supported but less commonly used
  // interactiveWidget: 'resizes-visual',
}
```

```jsx filename="layout.jsx | page.jsx" switcher
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // Also supported but less commonly used
  // interactiveWidget: 'resizes-visual',
}
```

```html filename="<head> output" hideLineNumbers
<meta
  name="viewport"
  content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
/>
```

### `colorScheme`

Learn more about [`color-scheme`](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/meta/name#:~:text=color%2Dscheme%3A%20specifies,of%20the%20following%3A).

```tsx filename="layout.tsx | page.tsx" switcher
import type { Viewport } from 'next'

export const viewport: Viewport = {
  colorScheme: 'dark',
}
```

```jsx filename="layout.jsx | page.jsx" switcher
export const viewport = {
  colorScheme: 'dark',
}
```

```html filename="<head> output" hideLineNumbers
<meta name="color-scheme" content="dark" />
```

## Types

You can add type safety to your viewport object by using the `Viewport` type. If you are using the [built-in TypeScript plugin](/docs/app/api-reference/config/typescript) in your IDE, you do not need to manually add the type, but you can still explicitly add it if you want.

### `viewport` object

```tsx
import type { Viewport } from 'next'

export const viewport: Viewport = {
  themeColor: 'black',
}
```

### `generateViewport` function

#### Regular function

```tsx
import type { Viewport } from 'next'

export function generateViewport(): Viewport {
  return {
    themeColor: 'black',
  }
}
```

#### With segment props

```tsx
import type { Viewport } from 'next'

type Props = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export function generateViewport({ params, searchParams }: Props): Viewport {
  return {
    themeColor: 'black',
  }
}

export default function Page({ params, searchParams }: Props) {}
```

#### JavaScript Projects

For JavaScript projects, you can use JSDoc to add type safety.

```js
/** @type {import("next").Viewport} */
export const viewport = {
  themeColor: 'black',
}
```

## Version History

| Version   | Changes                                       |
| --------- | --------------------------------------------- |
| `v14.0.0` | `viewport` and `generateViewport` introduced. |
