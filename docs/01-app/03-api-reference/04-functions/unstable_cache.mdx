---
title: unstable_cache
description: API Reference for the unstable_cache function.
---

> **Warning:** This API will be replaced by [`use cache`](/docs/app/api-reference/directives/use-cache) when it reaches stability.

`unstable_cache` allows you to cache the results of expensive operations, like database queries, and reuse them across multiple requests.

```jsx
import { getUser } from './data';
import { unstable_cache } from 'next/cache';

const getCachedUser = unstable_cache(
  async (id) => getUser(id),
  ['my-app-user']
);

export default async function Component({ userID }) {
  const user = await getCachedUser(userID);
  ...
}
```

> **Good to know**:
>
> - Accessing dynamic data sources such as `headers` or `cookies` inside a cache scope is not supported. If you need this data inside a cached function use `headers` outside of the cached function and pass the required dynamic data in as an argument.
> - This API uses Next.js' built-in [Data Cache](/docs/app/guides/caching#data-cache) to persist the result across requests and deployments.

## Parameters

```jsx
const data = unstable_cache(fetchData, keyParts, options)()
```

- `fetchData`: This is an asynchronous function that fetches the data you want to cache. It must be a function that returns a `Promise`.
- `keyParts`: This is an extra array of keys that further adds identification to the cache. By default, `unstable_cache` already uses the arguments and the stringified version of your function as the cache key. It is optional in most cases; the only time you need to use it is when you use external variables without passing them as parameters. However, it is important to add closures used within the function if you do not pass them as parameters.
- `options`: This is an object that controls how the cache behaves. It can contain the following properties:
  - `tags`: An array of tags that can be used to control cache invalidation. Next.js will not use this to uniquely identify the function.
  - `revalidate`: The number of seconds after which the cache should be revalidated. Omit or pass `false` to cache indefinitely or until matching `revalidateTag()` or `revalidatePath()` methods are called.

## Returns

`unstable_cache` returns a function that when invoked, returns a Promise that resolves to the cached data. If the data is not in the cache, the provided function will be invoked, and its result will be cached and returned.

## Example

```tsx filename="app/page.tsx" switcher
import { unstable_cache } from 'next/cache'

export default async function Page({
  params,
}: {
  params: Promise<{ userId: string }>
}) {
  const { userId } = await params
  const getCachedUser = unstable_cache(
    async () => {
      return { id: userId }
    },
    [userId], // add the user ID to the cache key
    {
      tags: ['users'],
      revalidate: 60,
    }
  )

  //...
}
```

```jsx filename="app/page.jsx" switcher
import { unstable_cache } from 'next/cache';

export default async function Page({ params } }) {
  const { userId } = await params
  const getCachedUser = unstable_cache(
    async () => {
      return { id: userId };
    },
    [userId], // add the user ID to the cache key
    {
      tags: ["users"],
      revalidate: 60,
    }
  );

  //...
}
```

## Version History

| Version   | Changes                      |
| --------- | ---------------------------- |
| `v14.0.0` | `unstable_cache` introduced. |
