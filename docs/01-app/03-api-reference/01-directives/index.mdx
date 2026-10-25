---
title: Directives
description: Learn how React and Next.js directives define client entry points, Server Functions, and cached output.
---

Directives are string literals that tell the compiler and bundler how to treat the code around them. On their own, directives look like plain strings, but Next.js and React read them as instructions that transform the code they cover. A directive can create a client entry point or a Server Function, or cache a function's or component's output.

| Directive                                                       | Defined by | Effect                                              |
| --------------------------------------------------------------- | ---------- | --------------------------------------------------- |
| [`'use client'`](/docs/app/api-reference/directives/use-client) | React      | Creates a client entry point from Server Components |
| [`'use server'`](/docs/app/api-reference/directives/use-server) | React      | Exposes server-side functions as Server Functions   |
| [`'use cache'`](/docs/app/api-reference/directives/use-cache)   | Next.js    | Caches and reuses output based on the code's inputs |

The `'use cache'` directive also has [`'use cache: remote'`](/docs/app/api-reference/directives/use-cache-remote) and [`'use cache: private'`](/docs/app/api-reference/directives/use-cache-private) variants. Configure custom [cache handlers](/docs/app/api-reference/config/next-config-js/cacheHandlers) to control where cached entries are stored.

> **Good to know:** Next.js applies directives during compilation in both development and production.
>
> The error overlay, indicators, and stack traces point to your source file and line rather than the generated output.

## Where to place a directive

The `'use client'` directive must appear at the top of a file, before any imports. It applies to the entire module and defines a file-wide boundary because the module is bundled and shipped to the browser. You cannot use `'use client'` inline.

Place `'use server'` or `'use cache'` at the top of a file to apply the directive to every export. Place either directive at the top of a function to apply it only to that function.

```ts filename="app/data.ts" switcher
// File-level: applies to every export
'use cache'

export async function getUser(id: string) {
  return { id }
}
```

```js filename="app/data.js" switcher
// File-level: applies to every export
'use cache'

export async function getUser(id) {
  return { id }
}
```

```tsx filename="app/user.tsx" switcher
// Function-level: applies to this function only
export async function User() {
  'use cache'
  return <p>User</p>
}
```

```jsx filename="app/user.js" switcher
// Function-level: applies to this function only
export async function User() {
  'use cache'
  return <p>User</p>
}
```

Declare `'use server'` and `'use cache'` in server modules, not in a `'use client'` module.

To import a `'use server'` or `'use cache'` function into a Client Component, place the directive at the top of the server module. The Client Component receives a reference that invokes the function on the server.

Place the directive inside a function when it should apply only to that function or component. When it should apply to several exported functions, place it at the top of the file instead of repeating it.

Every exported function covered by a file-level `'use server'` or `'use cache'` directive must be `async`.

## What each directive requires

A directive imposes rules on the code it covers:

- **`'use client'`** marks its exports as the boundary between server and client. Client Component props that cross the boundary must be [serializable](https://react.dev/reference/rsc/use-client#serializable-types). Ordinary functions, such as event handlers, cannot cross, but Server Functions can cross as references.
- **`'use server'`** marks the functions it covers as [Server Functions](/docs/app/glossary#server-function). Server Functions must be `async`. When invoked from a Client Component, their arguments and return values are serialized across the network. The Client Component receives a reference that invokes the function on the server, not the function's code.
- **`'use cache'`** caches the output of the functions or components it covers based on their inputs. Cached functions and components must be `async`. Their arguments and return values must be serializable, except for non-serializable values that the cached code passes through without inspecting. Cached code cannot read request-time APIs like `cookies()`, `headers()`, or `searchParams` directly.

With `'use cache'` at the top of a page or layout file, exported functions such as `generateMetadata` and `generateStaticParams` must be `async`.

## Placement decides what you cache

With `'use cache'`, placement determines the scope of a cache entry. A directive at the top of a page caches the page's output and the components it imports. The same directive inside a data function caches only that function's result. When one data request performs the expensive work, cache that function instead of the page.

With [`'use cache: remote'`](/docs/app/api-reference/directives/use-cache-remote), a remote cache handler stores entries. Larger entries can increase storage and network costs.
