---
title: How to build single-page applications with Next.js
nav_title: SPAs
description: Next.js fully supports building Single-Page Applications (SPAs).
related:
  description: Related guides and references.
  links:
    - app/guides/client-side-data-fetching
    - app/guides/interactive-apps
    - app/guides/server-actions
    - app/guides/forms
    - app/guides/streaming
    - app/guides/static-exports
---

Build Single-Page Applications (SPAs) with client-side navigation and data fetching. Next.js supports client and server patterns in the same app, and existing SPAs can migrate without a full rewrite.

## What is a Single-Page Application?

The definition of a SPA varies. We'll define a "strict SPA" as:

- **Client-side rendering (CSR)**: The app is served by one HTML file (e.g. `index.html`). Every route, page transition, and data fetch is handled by JavaScript in the browser.
- **No full-page reloads**: Rather than requesting a new document for each route, client-side JavaScript manipulates the current page's DOM and fetches data as needed.

Strict SPAs often require large amounts of JavaScript to load before the page can be interactive. Further, client data waterfalls can be challenging to manage. Building SPAs with Next.js can address these issues.

## Why use Next.js for SPAs?

Next.js can automatically code split your JavaScript bundles, and generate multiple HTML entry points into different routes. This avoids loading unnecessary JavaScript code on the client-side, reducing the bundle size and enabling faster page loads.

The [`next/link`](/docs/app/api-reference/components/link) component automatically [prefetches](/docs/app/api-reference/components/link#prefetch) routes, giving you the fast page transitions of a strict SPA, but with the advantage of persisting application routing state to the URL for linking and sharing.

Next.js can start as a static site or even a strict SPA where everything is rendered client-side. If your project grows, you can progressively add more server features (e.g. [React Server Components](/docs/app/getting-started/server-and-client-components), [Server Actions](/docs/app/guides/server-actions), and more) as needed.

## Build common SPA patterns

The following examples cover common patterns for building an SPA with Next.js. The companion [demo](https://next-spa-patterns.labs.vercel.dev) ([source](https://github.com/vercel-labs/next-spa-patterns)) shows each pattern in action.

### Using React's `use` within a Context Provider

You can use React's [`use` API](https://react.dev/reference/react/use) to stream data from the server to a Client Component. Fetch the data in a Server Component (a parent or layout) and pass the Promise down. The Client Component unwraps it with `use()`, since it cannot `await` during render.

Starting the request on the server, before the rest of the app renders, lets the response stream immediately and avoids client-side request waterfalls.

You can pass a single Promise as a prop and unwrap it with `use()`, or pair it with a React context provider so any Client Component can read the value through a custom hook.

When a Client Component needs focus revalidation, polling, mutations, or request deduplication, use a library such as SWR or TanStack Query. See [Client-side data fetching](/docs/app/guides/client-side-data-fetching) for direct browser fetching, providing initial data from a Server Component, and coordinating the library cache with the Next.js server and client caches.

Start the request in a Server Component (here, the root layout) without awaiting it, and pass the Promise to the provider:

```tsx filename="app/layout.tsx" switcher
import { UserProvider } from './user-provider'
import { getUser } from './user' // some server-side function

export default function RootLayout({ children }: LayoutProps<'/'>) {
  let userPromise = getUser() // do NOT await

  return (
    <html lang="en">
      <body>
        <UserProvider userPromise={userPromise}>{children}</UserProvider>
      </body>
    </html>
  )
}
```

```jsx filename="app/layout.js" switcher
import { UserProvider } from './user-provider'
import { getUser } from './user' // some server-side function

export default function RootLayout({ children }) {
  let userPromise = getUser() // do NOT await

  return (
    <html lang="en">
      <body>
        <UserProvider userPromise={userPromise}>{children}</UserProvider>
      </body>
    </html>
  )
}
```

> **Good to know:** Refetching a Promise set high in the tree re-runs the Server Component that set it, so for data only part of the app needs, place the provider on that subtree instead of the root layout. See React's [caveat on reading a Promise from context](https://react.dev/reference/react/use#reading-a-promise-from-context).

If several components read the same data in one request, wrap `getUser` in React's [`cache`](https://react.dev/reference/react/cache) so they share a single call. See [Reusing data with `React.cache`](/docs/app/getting-started/fetching-data#reusing-data-with-reactcache) for more on this pattern.

The provider forwards the Promise through context:

```tsx filename="app/user-provider.tsx" switcher
'use client'

import { createContext, useContext } from 'react'

type User = { id: string; name: string }

const UserContext = createContext<Promise<User> | null>(null)

export function useUser() {
  const userPromise = useContext(UserContext)
  if (!userPromise) {
    throw new Error('useUser must be used within a UserProvider')
  }
  return userPromise
}

export function UserProvider({
  children,
  userPromise,
}: {
  children: React.ReactNode
  userPromise: Promise<User>
}) {
  return (
    <UserContext.Provider value={userPromise}>{children}</UserContext.Provider>
  )
}
```

```js filename="app/user-provider.js" switcher
'use client'

import { createContext, useContext } from 'react'

const UserContext = createContext(null)

export function useUser() {
  const userPromise = useContext(UserContext)
  if (!userPromise) {
    throw new Error('useUser must be used within a UserProvider')
  }
  return userPromise
}

export function UserProvider({ children, userPromise }) {
  return (
    <UserContext.Provider value={userPromise}>{children}</UserContext.Provider>
  )
}
```

Finally, call the `useUser()` hook in any Client Component and unwrap the Promise with `use()`, which suspends the component until the data is ready:

```tsx filename="app/profile.tsx" switcher
'use client'

import { use } from 'react'
import { useUser } from './user-provider'

export function Profile() {
  const userPromise = useUser()
  const user = use(userPromise)

  return <p>{user.name}</p>
}
```

```jsx filename="app/profile.js" switcher
'use client'

import { use } from 'react'
import { useUser } from './user-provider'

export function Profile() {
  const userPromise = useUser()
  const user = use(userPromise)

  return <p>{user.name}</p>
}
```

Wrap the consumer in a [`<Suspense>`](https://react.dev/reference/react/Suspense) boundary to show a fallback while the Promise resolves:

```tsx filename="app/page.tsx" switcher
import { Suspense } from 'react'
import { Profile } from './profile'

export default function Page() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <Profile />
    </Suspense>
  )
}
```

```jsx filename="app/page.js" switcher
import { Suspense } from 'react'
import { Profile } from './profile'

export default function Page() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <Profile />
    </Suspense>
  )
}
```

The component that consumes the Promise (e.g. `Profile` above) suspends while the Promise resolves, so you see the streamed, prerendered HTML before JavaScript has finished loading.

See the [live demo](https://next-spa-patterns.labs.vercel.dev/use-context) and its [source code](https://github.com/vercel-labs/next-spa-patterns/tree/main/app/use-context).

### Rendering components only in the browser

Client components are [prerendered](https://github.com/reactwg/server-components/discussions/4) during `next build`. If you want to disable prerendering for a Client Component and only load it in the browser environment, you can use [`next/dynamic`](/docs/app/guides/lazy-loading#nextdynamic):

```jsx
import dynamic from 'next/dynamic'

const ClientOnlyComponent = dynamic(() => import('./component'), {
  ssr: false,
})
```

This can be useful for third-party libraries that rely on browser APIs like `window` or `document`. You can also add a `useEffect` that checks for the existence of these APIs, and if they do not exist, return `null` or a loading state which would be prerendered.

See the [live demo](https://next-spa-patterns.labs.vercel.dev/browser-only) and its [source code](https://github.com/vercel-labs/next-spa-patterns/tree/main/app/browser-only).

### Shallow routing on the client

If you are migrating from a strict SPA like [Create React App](/docs/app/guides/migrating/from-create-react-app) or [Vite](/docs/app/guides/migrating/from-vite), you might have existing code which shallow routes to update the URL state. This can be useful for manual transitions between views in your application _without_ using the default Next.js file-system routing.

Next.js lets you use the native [`window.history.pushState`](https://developer.mozilla.org/en-US/docs/Web/API/History/pushState) and [`window.history.replaceState`](https://developer.mozilla.org/en-US/docs/Web/API/History/replaceState) methods to update the browser's history stack without reloading the page.

The `pushState` and `replaceState` calls integrate into the Next.js Router, allowing you to sync with [`usePathname`](/docs/app/api-reference/functions/use-pathname) and [`useSearchParams`](/docs/app/api-reference/functions/use-search-params).

```tsx filename="app/ui/sort-products.tsx" switcher
'use client'

import { useSearchParams } from 'next/navigation'

export default function SortProducts() {
  const searchParams = useSearchParams()

  function updateSorting(sortOrder: string) {
    const urlSearchParams = new URLSearchParams(searchParams.toString())
    urlSearchParams.set('sort', sortOrder)
    window.history.pushState(null, '', `?${urlSearchParams.toString()}`)
  }

  return (
    <>
      <button onClick={() => updateSorting('asc')}>Sort Ascending</button>
      <button onClick={() => updateSorting('desc')}>Sort Descending</button>
    </>
  )
}
```

```jsx filename="app/ui/sort-products.js" switcher
'use client'

import { useSearchParams } from 'next/navigation'

export default function SortProducts() {
  const searchParams = useSearchParams()

  function updateSorting(sortOrder) {
    const urlSearchParams = new URLSearchParams(searchParams.toString())
    urlSearchParams.set('sort', sortOrder)
    window.history.pushState(null, '', `?${urlSearchParams.toString()}`)
  }

  return (
    <>
      <button onClick={() => updateSorting('asc')}>Sort Ascending</button>
      <button onClick={() => updateSorting('desc')}>Sort Descending</button>
    </>
  )
}
```

Learn more about how [routing and navigation](/docs/app/getting-started/linking-and-navigating#how-navigation-works) work in Next.js.

See the [live demo](https://next-spa-patterns.labs.vercel.dev/shallow-routing) and its [source code](https://github.com/vercel-labs/next-spa-patterns/tree/main/app/shallow-routing).

### Mutating data with Server Actions

Interactivity often requires writing data. A Client Component can call a [Server Action](/docs/app/guides/server-actions) to run the mutation on the server. A client data-fetching library can coordinate an optimistic browser update around the same Server Action, as shown in the [client-side data fetching guide](/docs/app/guides/client-side-data-fetching#coordinate-mutations). The rest of this section coordinates the Server Action with React's built-in state APIs.

A Server Action takes time and can fail. React has useful tools to keep the UI responsive while it runs, so a mutation can feel as instant as a client-rendered SPA: [transitions](https://react.dev/reference/react/useTransition), [`useOptimistic`](https://react.dev/reference/react/useOptimistic), [`useActionState`](https://react.dev/reference/react/useActionState), and [`useFormStatus`](https://react.dev/reference/react-dom/hooks/useFormStatus).

At its simplest, a Client Component calls a Server Action inside a transition and uses the pending state for feedback:

```tsx filename="app/delete-post.tsx" switcher
'use client'

import { useTransition } from 'react'
import { deletePost } from './actions'

export function DeletePost({ id }: { id: string }) {
  const [isPending, startTransition] = useTransition()

  return (
    <button
      disabled={isPending}
      onClick={() => startTransition(() => deletePost(id))}
    >
      {isPending ? 'Deleting…' : 'Delete'}
    </button>
  )
}
```

```jsx filename="app/delete-post.js" switcher
'use client'

import { useTransition } from 'react'
import { deletePost } from './actions'

export function DeletePost({ id }) {
  const [isPending, startTransition] = useTransition()

  return (
    <button
      disabled={isPending}
      onClick={() => startTransition(() => deletePost(id))}
    >
      {isPending ? 'Deleting…' : 'Delete'}
    </button>
  )
}
```

For list-like state where each change should appear instantly, you can combine `useActionState` with `useOptimistic`. The example below is a to-do list: a pure reducer defines how each action changes the list, so the client and server share one copy of that logic:

```ts filename="app/todos-reducer.ts" switcher
export type Todo = { id: string; text: string; done: boolean }

export type TodoAction =
  | { type: 'add'; id: string; text: string }
  | { type: 'toggle'; id: string }
  | { type: 'edit'; id: string; text: string }
  | { type: 'delete'; id: string }

export function todosReducer(todos: Todo[], action: TodoAction): Todo[] {
  switch (action.type) {
    case 'add':
      return [...todos, { id: action.id, text: action.text, done: false }]
    case 'toggle':
      return todos.map((todo) =>
        todo.id === action.id ? { ...todo, done: !todo.done } : todo
      )
    case 'edit':
      return todos.map((todo) =>
        todo.id === action.id ? { ...todo, text: action.text } : todo
      )
    case 'delete':
      return todos.filter((todo) => todo.id !== action.id)
    default:
      return todos
  }
}
```

```js filename="app/todos-reducer.js" switcher
export function todosReducer(todos, action) {
  switch (action.type) {
    case 'add':
      return [...todos, { id: action.id, text: action.text, done: false }]
    case 'toggle':
      return todos.map((todo) =>
        todo.id === action.id ? { ...todo, done: !todo.done } : todo
      )
    case 'edit':
      return todos.map((todo) =>
        todo.id === action.id ? { ...todo, text: action.text } : todo
      )
    case 'delete':
      return todos.filter((todo) => todo.id !== action.id)
    default:
      return todos
  }
}
```

The Server Action applies the reducer, persists the result, and returns the next list:

```ts filename="app/actions.ts" switcher
'use server'

import { db } from './db'
import { todosReducer, type Todo, type TodoAction } from './todos-reducer'

export async function saveTodos(
  todos: Todo[],
  action: TodoAction
): Promise<Todo[]> {
  const next = todosReducer(todos, action)
  await db.saveTodos(next)
  return next
}
```

```js filename="app/actions.js" switcher
'use server'

import { db } from './db'
import { todosReducer } from './todos-reducer'

export async function saveTodos(todos, action) {
  const next = todosReducer(todos, action)
  await db.saveTodos(next)
  return next
}
```

The client passes the same reducer to `useOptimistic`, so the optimistic update and the server compute the next state identically. A `runAction` helper applies the optimistic change and dispatches the Server Action in the same transition, so every change shows immediately:

```tsx filename="app/todo-list.tsx" switcher
'use client'

import { useActionState, useOptimistic, startTransition } from 'react'
import { saveTodos } from './actions'
import { todosReducer, type Todo, type TodoAction } from './todos-reducer'

export function TodoList({ initialTodos }: { initialTodos: Todo[] }) {
  const [todos, dispatch, isPending] = useActionState(saveTodos, initialTodos)
  const [optimisticTodos, addOptimistic] = useOptimistic(todos, todosReducer)

  function runAction(action: TodoAction) {
    startTransition(() => {
      addOptimistic(action)
      dispatch(action)
    })
  }

  return (
    <>
      <form
        action={(formData) =>
          runAction({
            type: 'add',
            id: crypto.randomUUID(),
            text: String(formData.get('text')),
          })
        }
      >
        <input name="text" />
        <button>Add</button>
      </form>
      <ul>
        {optimisticTodos.map((todo) => (
          <li key={todo.id}>
            <input
              type="checkbox"
              checked={todo.done}
              onChange={() => runAction({ type: 'toggle', id: todo.id })}
            />
            <span
              style={{ textDecoration: todo.done ? 'line-through' : 'none' }}
            >
              {todo.text}
            </span>
            <button onClick={() => runAction({ type: 'delete', id: todo.id })}>
              Delete
            </button>
          </li>
        ))}
      </ul>
      {isPending && <p>Syncing to server…</p>}
    </>
  )
}
```

```jsx filename="app/todo-list.js" switcher
'use client'

import { useActionState, useOptimistic, startTransition } from 'react'
import { saveTodos } from './actions'
import { todosReducer } from './todos-reducer'

export function TodoList({ initialTodos }) {
  const [todos, dispatch, isPending] = useActionState(saveTodos, initialTodos)
  const [optimisticTodos, addOptimistic] = useOptimistic(todos, todosReducer)

  function runAction(action) {
    startTransition(() => {
      addOptimistic(action)
      dispatch(action)
    })
  }

  return (
    <>
      <form
        action={(formData) =>
          runAction({
            type: 'add',
            id: crypto.randomUUID(),
            text: String(formData.get('text')),
          })
        }
      >
        <input name="text" />
        <button>Add</button>
      </form>
      <ul>
        {optimisticTodos.map((todo) => (
          <li key={todo.id}>
            <input
              type="checkbox"
              checked={todo.done}
              onChange={() => runAction({ type: 'toggle', id: todo.id })}
            />
            <span
              style={{ textDecoration: todo.done ? 'line-through' : 'none' }}
            >
              {todo.text}
            </span>
            <button onClick={() => runAction({ type: 'delete', id: todo.id })}>
              Delete
            </button>
          </li>
        ))}
      </ul>
      {isPending && <p>Syncing to server…</p>}
    </>
  )
}
```

The optimistic update shows instantly, while `useActionState`'s pending flag lets you display a subtle indicator (such as `Syncing to server…`) until the Server Action resolves.

See the [live demo](https://next-spa-patterns.labs.vercel.dev/mutations) and its [source code](https://github.com/vercel-labs/next-spa-patterns/tree/main/app/mutations).

To learn more about adding interactivity on top of server-rendered apps so they feel like SPAs, see the [Building interactive apps](/docs/app/guides/interactive-apps) guide and its runnable demo.

## Static export (optional)

Next.js also supports generating a fully [static site](/docs/app/guides/static-exports). This has some advantages over strict SPAs:

- **Automatic code-splitting**: Instead of shipping a single `index.html`, Next.js will generate an HTML file per route, so your visitors get the content faster without waiting for the client JavaScript bundle.
- **Improved user experience:** Instead of a minimal skeleton for all routes, you get fully rendered pages for each route. When users navigate client side, transitions are still instant and SPA-like.

To enable a static export, update your configuration:

```ts filename="next.config.ts"
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'export',
}

export default nextConfig
```

After running `next build`, Next.js will create an `out` folder with the HTML/CSS/JS assets for your application.

> **Note:** Next.js server features are not supported with static exports. [Learn more](/docs/app/guides/static-exports#unsupported-features).

## Migrating existing projects to Next.js

You can incrementally migrate to Next.js by following our guides:

- [Migrating from Create React App](/docs/app/guides/migrating/from-create-react-app)
- [Migrating from Vite](/docs/app/guides/migrating/from-vite)

If you are already using a SPA with the Pages Router, you can learn how to [incrementally adopt the App Router](/docs/app/guides/migrating/app-router-migration).
