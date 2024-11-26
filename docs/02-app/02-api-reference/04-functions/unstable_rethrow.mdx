---
title: unstable_rethrow
description: API Reference for the unstable_rethrow function.
version: unstable
---

`unstable_rethrow` can be used to avoid catching internal errors thrown by Next.js when attempting to handle errors thrown in your application code.

For example, calling the `notFound` function will throw an internal Next.js error and render the [`not-found.js`](/docs/app/api-reference/file-conventions/not-found) component. However, if used inside a `try/catch` block, the error will be caught, preventing `not-found.js` from rendering:

```tsx filename="@/app/ui/component.tsx"
import { notFound } from 'next/navigation'

export default async function Page() {
  try {
    const post = await fetch('https://.../posts/1').then((res) => {
      if (res.status === 404) notFound()
      if (!res.ok) throw new Error(res.statusText)
      return res.json()
    })
  } catch (err) {
    console.error(err)
  }
}
```

You can use `unstable_rethrow` API to re-throw the internal error and continue with the expected behavior:

```tsx filename="@/app/ui/component.tsx"
import { notFound, unstable_rethrow } from 'next/navigation'

export default async function Page() {
  try {
    const post = await fetch('https://.../posts/1').then((res) => {
      if (res.status === 404) notFound()
      if (!res.ok) throw new Error(res.statusText)
      return res.json()
    })
  } catch (err) {
    unstable_rethrow(err)
    console.error(err)
  }
}
```

The following Next.js APIs rely on throwing an error which should be rethrown and handled by Next.js itself:

- [`notFound()`](/docs/app/api-reference/functions/not-found)
- [`redirect()`](/docs/app/building-your-application/routing/redirecting#redirect-function)
- [`permanentRedirect()`](/docs/app/building-your-application/routing/redirecting#permanentredirect-function)

If a route segment is marked to throw an error unless it's static, a Dynamic API call will also throw an error that should similarly not be caught by the developer. Note that Partial Prerendering (PPR) affects this behavior as well. These APIs are:

- [`cookies`](/docs/app/api-reference/functions/cookies)
- [`headers`](/docs/app/api-reference/functions/headers)
- [`searchParams`](/docs/app/api-reference/file-conventions/page#searchparams-optional)
- `fetch(..., { cache: 'no-store' })`
- `fetch(..., { next: { revalidate: 0 } })`

> **Good to know**:
>
> - This method should be called at the top of the catch block, passing the error object as its only argument. It can also be used within a `.catch` handler of a promise.
> - If you ensure that your calls to APIs that throw are not wrapped in a try/catch then you don't need to use `unstable_rethrow`
> - Any resource cleanup (like clearing intervals, timers, etc) would have to either happen prior to the call to `unstable_rethrow` or within a `finally` block.
