---
title: unstable_catchError
description: API Reference for the unstable_catchError function.
related:
  title: Learn more about error handling
  links:
    - app/getting-started/error-handling
    - app/api-reference/file-conventions/error
---

The `unstable_catchError` function creates a component that wraps its children in an error boundary. It provides a programmatic alternative to the [`error.js`](/docs/app/api-reference/file-conventions/error) file convention, enabling component-level error recovery anywhere in your component tree.

`unstable_catchError` can be called from [Client Components](/docs/app/getting-started/server-and-client-components).

```tsx filename="app/custom-error-boundary.tsx" switcher
'use client'

import { unstable_catchError } from 'next/error'

function ErrorFallback(
  props: { title: string },
  { error, unstable_retry: retry }: { error: Error; unstable_retry: () => void }
) {
  return (
    <div>
      <h2>{props.title}</h2>
      <p>{error.message}</p>
      <button onClick={() => retry()}>Try again</button>
    </div>
  )
}

export default unstable_catchError(ErrorFallback)
```

```jsx filename="app/custom-error-boundary.js" switcher
'use client'

import { unstable_catchError } from 'next/error'

function ErrorFallback(props, { error, unstable_retry: retry }) {
  return (
    <div>
      <h2>{props.title}</h2>
      <p>{error.message}</p>
      <button onClick={() => retry()}>Try again</button>
    </div>
  )
}

export default unstable_catchError(ErrorFallback)
```

## Reference

### Parameters

`unstable_catchError` accepts a single argument:

```ts
const ErrorWrapper = unstable_catchError(fallback)
```

#### `fallback`

A function that renders the error UI when an error is caught. It receives two arguments:

- `props` — The props passed to the wrapper component (excluding `children`).
- `errorInfo` — An object containing information about the error:

| Property         | Type                                                                                        | Description                                                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `error`          | [`Error`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Error) | The error instance that was caught.                                                                                                                      |
| `unstable_retry` | `() => void`                                                                                | Re-fetches and re-renders the error boundary's contents. If successful, the fallback is replaced with the re-rendered result.                            |
| `reset`          | `() => void`                                                                                | Resets the error state and re-renders without re-fetching. Use [`retry()`](/docs/app/api-reference/file-conventions/error#unstable_retry) in most cases. |

The `fallback` function must be a Client Component (or defined in a `'use client'` module).

### Returns

`unstable_catchError` returns a React component that:

- Accepts the same props as your fallback's first argument, plus `children`.
- Wraps `children` in an error boundary.
- Renders the `fallback` when an error is caught in `children`.

## Examples

### Client Component

Define a fallback and use the returned component to wrap parts of your UI:

```tsx filename="app/some-component.tsx" switcher
import ErrorWrapper from '../custom-error-boundary'

export default function Component({ children }: { children: React.ReactNode }) {
  return <ErrorWrapper title="Dashboard Error">{children}</ErrorWrapper>
}
```

```jsx filename="app/some-component.js" switcher
import ErrorWrapper from '../custom-error-boundary'

export default function Component({ children }) {
  return <ErrorWrapper title="Dashboard Error">{children}</ErrorWrapper>
}
```

### Recovering from errors

Use `retry()` to prompt the user to recover from the error. When called, the function re-fetches and re-renders the error boundary's contents. If successful, the fallback is replaced with the re-rendered result.

In most cases, use `retry()` instead of `reset()`. The `reset()` function only clears the error state and re-renders without re-fetching, which means it won't recover from Server Component errors.

```tsx filename="app/custom-error-boundary.tsx" highlight={16,17} switcher
'use client'

import { unstable_catchError } from 'next/error'

function ErrorFallback(
  props: {},
  {
    error,
    unstable_retry: retry,
    reset,
  }: { error: Error; unstable_retry: () => void; reset: () => void }
) {
  return (
    <div>
      <p>{error.message}</p>
      <button onClick={() => retry()}>Try again</button>
      <button onClick={() => reset()}>Reset</button>
    </div>
  )
}

export default unstable_catchError(ErrorFallback)
```

```jsx filename="app/custom-error-boundary.js" highlight={9,10} switcher
'use client'

import { unstable_catchError } from 'next/error'

function ErrorFallback(props, { error, unstable_retry: retry, reset }) {
  return (
    <div>
      <p>{error.message}</p>
      <button onClick={() => retry()}>Try again</button>
      <button onClick={() => reset()}>Reset</button>
    </div>
  )
}

export default unstable_catchError(ErrorFallback)
```

### Server-rendered error fallback

You can pass server-rendered content as a prop to display data-driven fallback UI. This works by rendering a Server Component as a `React.ReactNode` prop that the fallback displays when an error is caught.

> **Good to know**: This pattern eagerly renders the fallback on every page render, even when no error occurs. For most use cases, a simpler client-side fallback is sufficient.

```tsx filename="app/error-boundary.tsx" switcher
'use client'

import { unstable_catchError } from 'next/error'
import type { ErrorInfo } from 'next/error'

function ErrorFallback(
  props: { fallback: React.ReactNode },
  errorInfo: ErrorInfo
) {
  return props.fallback
}

export default unstable_catchError(ErrorFallback)
```

```jsx filename="app/error-boundary.js" switcher
'use client'

import { unstable_catchError } from 'next/error'

function ErrorFallback(props, errorInfo) {
  return props.fallback
}

export default unstable_catchError(ErrorFallback)
```

```tsx filename="app/some-component.tsx" switcher
import ErrorBoundary from '../error-boundary'

async function ErrorFallback() {
  const data = await getData()
  return <div>{data.message}</div>
}

export default function Component({ children }: { children: React.ReactNode }) {
  return <ErrorBoundary fallback={<ErrorFallback />}>{children}</ErrorBoundary>
}
```

```jsx filename="app/some-component.js" switcher
import ErrorBoundary from '../error-boundary'

async function ErrorFallback() {
  const data = await getData()
  return <div>{data.message}</div>
}

export default function Component({ children }) {
  return <ErrorBoundary fallback={<ErrorFallback />}>{children}</ErrorBoundary>
}
```

> **Good to know**:
>
> - Unlike the `error.js` file convention which is scoped to route segments, `unstable_catchError` can be used to wrap any part of your component tree for component-level error recovery.
> - Props passed to the wrapper component are forwarded to the fallback function, making it easy to create reusable error UIs with different configurations.
> - You don't need to wrap `error.js` default exports with `unstable_catchError`. The [`error.js`](/docs/app/api-reference/file-conventions/error) file convention already renders inside a built-in error boundary provided by Next.js.

## Version History

| Version   | Changes                           |
| --------- | --------------------------------- |
| `v16.2.0` | `unstable_catchError` introduced. |
