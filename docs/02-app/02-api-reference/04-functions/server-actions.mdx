---
title: Server Actions
nav_title: Server Actions
description: API Reference for Next.js Server Actions.
related:
  title: Next Steps
  description: For more information on what to do next, we recommend the following sections
  links:
    - app/building-your-application/data-fetching/forms-and-mutations
---

{/* TODO: This page will need to link back to React docs mentioned at the bottom */}

Next.js integrates with React Actions to provide a built-in solution for [server mutations](/docs/app/building-your-application/data-fetching/forms-and-mutations).

## Convention

You can enable Server Actions in your Next.js project by enabling the **experimental** `serverActions` flag.

```js filename="next.config.js"
module.exports = {
  experimental: {
    serverActions: true,
  },
}
```

Server Actions can be defined in two places:

- Inside the component that uses it (Server Components only).
- In a separate file (Client and Server Components), for reusability. You can define multiple Server Actions in a single file.

### With Server Components

Create a Server Action by defining an asynchronous function with the [`"use server"`](https://react.dev/reference/react/use-server) directive at the top of the function body. `"use server"` ensures this function is only ever executed on the server.

This function should have [serializable arguments](https://developer.mozilla.org/docs/Glossary/Serialization) and a [serializable return value](https://developer.mozilla.org/docs/Glossary/Serialization).

```jsx filename="app/page.js" highlight={2}
export default function ServerComponent() {
  async function myAction() {
    'use server'
    // ...
  }
}
```

### With Client Components

#### Import

Create your Server Action in a separate file with the `"use server"` directive at the top of the file. Then, import the Server Action into your Client Component:

```js filename="app/actions.js" highlight={1}
'use server'

export async function myAction() {
  // ...
}
```

```jsx filename="app/client-component.jsx" highlight={1}
'use client'

import { myAction } from './actions'

export default function ClientComponent() {
  return (
    <form action={myAction}>
      <button type="submit">Add to Cart</button>
    </form>
  )
}
```

> **Good to know**: When using a top-level `"use server"` directive, all exports below will be considered Server Actions. You can have multiple Server Actions in a single file.

#### Props

In some cases, you might want to pass down a Server Action to a Client Component as a prop.

```jsx
<ClientComponent updateItem={updateItem} />
```

```jsx filename="app/client-component.jsx"
'use client'

export default function ClientComponent({ myAction }) {
  return (
    <form action={myAction}>
      <input type="text" name="name" />
      <button type="submit">Update Item</button>
    </form>
  )
}
```

### Binding Arguments

You can bind arguments to a Server Action using the `bind` method. This allows you to create a new Server Action with some arguments already bound. This is beneficial when you want to pass extra arguments to a Server Action.

```jsx filename="app/client-component.jsx" highlight={6}
'use client'

import { updateUser } from './actions'

export function UserProfile({ userId }) {
  const updateUserWithId = updateUser.bind(null, userId)

  return (
    <form action={updateUserWithId}>
      <input type="text" name="name" />
      <button type="submit">Update User Name</button>
    </form>
  )
}
```

And then, the `updateUser` Server Action will always receive the `userId` argument, in addition to the form data:

```js filename="app/actions.js"
'use server'

export async function updateUser(userId, formData) {
  // ...
}
```

> **Good to know**: `.bind` of a Server Action works in both Server and Client Components. It also supports [Progressive Enhancement](#progressive-enhancement).

## Invocation

You can invoke Server Actions using the following methods:

- Using `action`: React's `action` prop allows invoking a Server Action on a `<form>` element.
- Using `formAction`: React's `formAction` prop allows handling `<button>`, `<input type="submit">`, and `<input type="image">` elements in a `<form>`.
- Custom Invocation with `startTransition`: Invoke Server Actions without using `action` or `formAction` by using `startTransition`. This method **disables [Progressive Enhancement](#progressive-enhancement)**.

## Progressive Enhancement

Progressive enhancement allows a `<form>` to function properly without JavaScript, or with JavaScript disabled. This allows users to interact with the form and submit data even if the JavaScript for the form hasn't been loaded yet or if it fails to load.

React Actions (both server and client) support progressive enhancement, using one of two strategies:

- If a **Server Action** is passed directly to a `<form>`, the form is interactive **even if JavaScript is disabled**.
- If a **Client Action** is passed to a `<form>`, the form is still interactive, but the action will be placed in a queue until the form has hydrated. React prioritizes the action, so it still happens quickly.

In both cases, the form is interactive before hydration occurs. Although Server Actions have the additional benefit of not relying on client JavaScript, you can still compose additional behavior with Client Actions where desired without sacrificing interactivity.

## Size Limitation

By default, the maximum size of the request body sent to a Server Action is 1MB, to prevent the consumption of excessive server resources in parsing large amounts of data.

However, you can configure this limit using the `serverActionsBodySizeLimit` option. It can take the number of bytes or any string format supported by bytes, for example `1000`, `'500kb'` or `'3mb'`.

```js filename="next.config.js"
module.exports = {
  experimental: {
    serverActions: true,
    serverActionsBodySizeLimit: '2mb',
  },
}
```

## Additional Resources

The following React API pages are currently being documented:

- [`"use server"`](https://react.dev/reference/react/use-server)
- `action` (🚧)
- `formAction` (🚧)
- `useFormStatus` (🚧)
- `useFormState` (🚧)
- `useOptimistic` (🚧)
