---
title: draftMode
description: API Reference for the draftMode function.
related:
  title: Next Steps
  description: Learn how to use Draft Mode with this step-by-step guide.
  links:
    - app/guides/draft-mode
---

`draftMode` is an **async** function allows you to enable and disable [Draft Mode](/docs/app/guides/draft-mode), as well as check if Draft Mode is enabled in a [Server Component](/docs/app/getting-started/server-and-client-components).

```tsx filename="app/page.ts" switcher
import { draftMode } from 'next/headers'

export default async function Page() {
  const { isEnabled } = await draftMode()
}
```

```jsx filename="app/page.js" switcher
import { draftMode } from 'next/headers'

export default async function Page() {
  const { isEnabled } = await draftMode()
}
```

## Reference

The following methods and properties are available:

| Method      | Description                                                                       |
| ----------- | --------------------------------------------------------------------------------- |
| `isEnabled` | A boolean value that indicates if Draft Mode is enabled.                          |
| `enable()`  | Enables Draft Mode in a Route Handler by setting a cookie (`__prerender_bypass`). |
| `disable()` | Disables Draft Mode in a Route Handler by deleting a cookie.                      |

## Good to know

- `draftMode` is an **asynchronous** function that returns a promise. You must use `async/await` or React's [`use`](https://react.dev/reference/react/use) function.
  - In version 14 and earlier, `draftMode` was a synchronous function. To help with backwards compatibility, you can still access it synchronously in Next.js 15, but this behavior will be deprecated in the future.
- A new bypass cookie value will be generated each time you run `next build`. This ensures that the bypass cookie can’t be guessed.
- To test Draft Mode locally over HTTP, your browser will need to allow third-party cookies and local storage access.

## Examples

### Enabling Draft Mode

To enable Draft Mode, create a new [Route Handler](/docs/app/api-reference/file-conventions/route) and call the `enable()` method:

```tsx filename="app/draft/route.ts" switcher
import { draftMode } from 'next/headers'

export async function GET(request: Request) {
  const draft = await draftMode()
  draft.enable()
  return new Response('Draft mode is enabled')
}
```

```js filename="app/draft/route.js" switcher
import { draftMode } from 'next/headers'

export async function GET(request) {
  const draft = await draftMode()
  draft.enable()
  return new Response('Draft mode is enabled')
}
```

### Disabling Draft Mode

By default, the Draft Mode session ends when the browser is closed.

To disable Draft Mode manually, call the `disable()` method in your [Route Handler](/docs/app/api-reference/file-conventions/route):

```tsx filename="app/draft/route.ts" switcher
import { draftMode } from 'next/headers'

export async function GET(request: Request) {
  const draft = await draftMode()
  draft.disable()
  return new Response('Draft mode is disabled')
}
```

```js filename="app/draft/route.js" switcher
import { draftMode } from 'next/headers'

export async function GET(request) {
  const draft = await draftMode()
  draft.disable()
  return new Response('Draft mode is disabled')
}
```

Then, send a request to invoke the Route Handler. If calling the route using the [`<Link>` component](/docs/app/api-reference/components/link), you must pass `prefetch={false}` to prevent accidentally deleting the cookie on prefetch.

### Checking if Draft Mode is enabled

You can check if Draft Mode is enabled in a Server Component with the `isEnabled` property:

```tsx filename="app/page.ts" switcher
import { draftMode } from 'next/headers'

export default async function Page() {
  const { isEnabled } = await draftMode()
  return (
    <main>
      <h1>My Blog Post</h1>
      <p>Draft Mode is currently {isEnabled ? 'Enabled' : 'Disabled'}</p>
    </main>
  )
}
```

```jsx filename="app/page.js" switcher
import { draftMode } from 'next/headers'

export default async function Page() {
  const { isEnabled } = await draftMode()
  return (
    <main>
      <h1>My Blog Post</h1>
      <p>Draft Mode is currently {isEnabled ? 'Enabled' : 'Disabled'}</p>
    </main>
  )
}
```

## Version History

| Version      | Changes                                                                                                  |
| ------------ | -------------------------------------------------------------------------------------------------------- |
| `v15.0.0-RC` | `draftMode` is now an async function. A [codemod](/docs/app/guides/upgrading/codemods#150) is available. |
| `v13.4.0`    | `draftMode` introduced.                                                                                  |
