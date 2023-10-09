---
title: Forms and Mutations
nav_title: Forms and Mutations
description: Learn how to handle form submissions and data mutations with Next.js.
---

{/* The content of this doc is shared between the app and pages router. You can use the `<PagesOnly>Content</PagesOnly>` component to add content that is specific to the Pages Router. Any shared content should not be wrapped in a component. */}

<PagesOnly>

Forms enable you to create and update data in web applications. Next.js provides a powerful way to handle form submissions and data mutations using **API Routes**.

> **Good to know:**
>
> - We will soon recommend [incrementally adopting](/docs/app/building-your-application/upgrading/app-router-migration) the App Router and using [Server Actions](/docs/app/building-your-application/data-fetching/forms-and-mutations#how-server-actions-work) for handling form submissions and data mutations. Server Actions allow you to define asynchronous server functions that can be called directly from your components, without needing to manually create an API Route.
> - API Routes [do not specify CORS headers](https://developer.mozilla.org/docs/Web/HTTP/CORS), meaning they are same-origin only by default.
> - Since API Routes run on the server, we're able to use sensitive values (like API keys) through [Environment Variables](/docs/pages/building-your-application/configuring/environment-variables) without exposing them to the client. This is critical for the security of your application.

</PagesOnly>

<AppOnly>

Forms enable you to create and update data in web applications. Next.js provides a powerful way to handle form submissions and data mutations using **Server Actions**.

<details>
  <summary>Examples</summary>

- [Form with Loading & Error States](https://github.com/vercel/next.js/tree/canary/examples/next-forms)

</details>

## How Server Actions Work

With Server Actions, you don't need to manually create API endpoints. Instead, you define asynchronous server functions that can be called directly from your components.

> **🎥 Watch:** Learn more about forms and mutations with the App Router → [YouTube (10 minutes)](https://youtu.be/dDpZfOQBMaU?si=cJZHlUu_jFhCzHUg).

Server Actions can be defined in Server Components or called from Client Components. Defining the action in a Server Component allows the form to function without JavaScript, providing progressive enhancement.

Enable Server Actions in your `next.config.js` file:

```js filename="next.config.js"
module.exports = {
  experimental: {
    serverActions: true,
  },
}
```

> **Good to know:**
>
> - Forms calling Server Actions from Server Components can function without JavaScript.
> - Forms calling Server Actions from Client Components will queue submissions if JavaScript isn't loaded yet, prioritizing client hydration.
> - Server Actions inherit the [runtime](/docs/app/building-your-application/rendering/edge-and-nodejs-runtimes) from the page or layout they are used on.
> - Server Actions work with fully static routes (including revalidating data with ISR).

## Revalidating Cached Data

Server Actions integrate deeply with the Next.js [caching and revalidation](/docs/app/building-your-application/caching) architecture. When a form is submitted, the Server Action can update cached data and revalidate any cache keys that should change.

Rather than being limited to a single form per route like traditional applications, Server Actions enable having multiple actions per route. Further, the browser does not need to refresh on form submission. In a single network roundtrip, Next.js can return both the updated UI and the refreshed data.

View the examples below for [revalidating data from Server Actions](#revalidating-data).

</AppOnly>

## Examples

### Server-only Forms

<PagesOnly>

With the Pages Router, you need to manually create API endpoints to handle securely mutating data on the server.

```ts filename="pages/api/submit.ts" switcher
import type { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const data = req.body
  const id = await createItem(data)
  res.status(200).json({ id })
}
```

```js filename="pages/api/submit.js" switcher
export default function handler(req, res) {
  const data = req.body
  const id = await createItem(data)
  res.status(200).json({ id })
}
```

Then, call the API Route from the client with an event handler:

```tsx filename="pages/index.tsx" switcher
import { FormEvent } from 'react'

export default function Page() {
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const formData = new FormData(event.currentTarget)
    const response = await fetch('/api/submit', {
      method: 'POST',
      body: formData,
    })

    // Handle response if necessary
    const data = await response.json()
    // ...
  }

  return (
    <form onSubmit={onSubmit}>
      <input type="text" name="name" />
      <button type="submit">Submit</button>
    </form>
  )
}
```

```jsx filename="pages/index.jsx" switcher
export default function Page() {
  async function onSubmit(event) {
    event.preventDefault()

    const formData = new FormData(event.target)
    const response = await fetch('/api/submit', {
      method: 'POST',
      body: formData,
    })

    // Handle response if necessary
    const data = await response.json()
    // ...
  }

  return (
    <form onSubmit={onSubmit}>
      <input type="text" name="name" />
      <button type="submit">Submit</button>
    </form>
  )
}
```

</PagesOnly>

<AppOnly>

To create a server-only form, define the Server Action in a Server Component. The action can either be defined inline with the `"use server"` directive at the top of the function, or in a separate file with the directive at the top of the file.

```tsx filename="app/page.tsx" switcher
export default function Page() {
  async function create(formData: FormData) {
    'use server'

    // mutate data
    // revalidate cache
  }

  return <form action={create}>...</form>
}
```

```jsx filename="app/page.jsx" switcher
export default function Page() {
  async function create(formData) {
    'use server'

    // mutate data
    // revalidate cache
  }

  return <form action={create}>...</form>
}
```

> **Good to know**: `<form action={create}>` takes the [FormData](https://developer.mozilla.org/docs/Web/API/FormData/FormData) data type. In the example above, the FormData submitted via the HTML [`form`](https://developer.mozilla.org/docs/Web/HTML/Element/form) is accessible in the server action `create`.

### Revalidating Data

Server Actions allow you to invalidate the [Next.js Cache](/docs/app/building-your-application/caching) on demand. You can invalidate an entire route segment with [`revalidatePath`](/docs/app/api-reference/functions/revalidatePath):

```ts filename="app/actions.ts" switcher
'use server'

import { revalidatePath } from 'next/cache'

export default async function submit() {
  await submitForm()
  revalidatePath('/')
}
```

```js filename="app/actions.js" switcher
'use server'

import { revalidatePath } from 'next/cache'

export default async function submit() {
  await submitForm()
  revalidatePath('/')
}
```

Or invalidate a specific data fetch with a cache tag using [`revalidateTag`](/docs/app/api-reference/functions/revalidateTag):

```ts filename="app/actions.ts" switcher
'use server'

import { revalidateTag } from 'next/cache'

export default async function submit() {
  await addPost()
  revalidateTag('posts')
}
```

```js filename="app/actions.js" switcher
'use server'

import { revalidateTag } from 'next/cache'

export default async function submit() {
  await addPost()
  revalidateTag('posts')
}
```

</AppOnly>

### Redirecting

<PagesOnly>

If you would like to redirect the user to a different route after a mutation, you can [`redirect`](/docs/pages/building-your-application/routing/api-routes#response-helpers) to any absolute or relative URL:

```ts filename="pages/api/submit.ts" switcher
import type { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const id = await addPost()
  res.redirect(307, `/post/${id}`)
}
```

```js filename="pages/api/submit.js" switcher
export default async function handler(req, res) {
  const id = await addPost()
  res.redirect(307, `/post/${id}`)
}
```

</PagesOnly>

<AppOnly>

If you would like to redirect the user to a different route after the completion of a Server Action, you can use [`redirect`](/docs/app/api-reference/functions/redirect) and any absolute or relative URL:

```ts filename="app/actions.ts" switcher
'use server'

import { redirect } from 'next/navigation'
import { revalidateTag } from 'next/cache'

export default async function submit() {
  const id = await addPost()
  revalidateTag('posts') // Update cached posts
  redirect(`/post/${id}`) // Navigate to new route
}
```

```js filename="app/actions.js" switcher
'use server'

import { redirect } from 'next/navigation'
import { revalidateTag } from 'next/cache'

export default async function submit() {
  const id = await addPost()
  revalidateTag('posts') // Update cached posts
  redirect(`/post/${id}`) // Navigate to new route
}
```

</AppOnly>

### Form Validation

We recommend using HTML validation like `required` and `type="email"` for basic form validation.

For more advanced server-side validation, use a schema validation library like [zod](https://zod.dev/) to validate the structure of the parsed form data:

<PagesOnly>

```ts filename="pages/api/submit.ts" switcher
import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'

const schema = z.object({
  // ...
})

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const parsed = schema.parse(req.body)
  // ...
}
```

```js filename="pages/api/submit.js" switcher
import { z } from 'zod'

const schema = z.object({
  // ...
})

export default async function handler(req, res) {
  const parsed = schema.parse(req.body)
  // ...
}
```

</PagesOnly>

<AppOnly>

```tsx filename="app/actions.ts" switcher
import { z } from 'zod'

const schema = z.object({
  // ...
})

export default async function submit(formData: FormData) {
  const parsed = schema.parse({
    id: formData.get('id'),
  })
  // ...
}
```

```jsx filename="app/actions.js" switcher
import { z } from 'zod'

const schema = z.object({
  // ...
})

export default async function submit(formData) {
  const parsed = schema.parse({
    id: formData.get('id'),
  })
  // ...
}
```

</AppOnly>

### Displaying Loading State

<AppOnly>

Use the `useFormStatus` hook to show a loading state when a form is submitting on the server. The `useFormStatus` hook can only be used as a child of a `form` element using a Server Action.

For example, the following submit button:

```tsx filename="app/submit-button.tsx" switcher
'use client'

import { experimental_useFormStatus as useFormStatus } from 'react-dom'

export function SubmitButton() {
  const { pending } = useFormStatus()

  return (
    <button type="submit" aria-disabled={pending}>
      Add
    </button>
  )
}
```

```jsx filename="app/submit-button.jsx" switcher
'use client'

import { experimental_useFormStatus as useFormStatus } from 'react-dom'

export function SubmitButton() {
  const { pending } = useFormStatus()

  return (
    <button type="submit" aria-disabled={pending}>
      Add
    </button>
  )
}
```

`<SubmitButton />` can then be used in a form with a Server Action:

```tsx filename="app/page.tsx" switcher
import { SubmitButton } from '@/app/submit-button'

export default async function Home() {
  return (
    <form action={...}>
      <input type="text" name="field-name" />
      <SubmitButton />
    </form>
  )
}
```

```jsx filename="app/page.jsx" switcher
import { SubmitButton } from '@/app/submit-button'

export default async function Home() {
  return (
    <form action={...}>
      <input type="text" name="field-name" />
      <SubmitButton />
    </form>
  )
}
```

</AppOnly>

<PagesOnly>

You can use React state to show a loading state when a form is submitting on the server:

```tsx filename="pages/index.tsx" switcher
import React, { useState, FormEvent } from 'react'

export default function Page() {
  const [isLoading, setIsLoading] = useState<boolean>(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsLoading(true) // Set loading to true when the request starts

    try {
      const formData = new FormData(event.currentTarget)
      const response = await fetch('/api/submit', {
        method: 'POST',
        body: formData,
      })

      // Handle response if necessary
      const data = await response.json()
      // ...
    } catch (error) {
      // Handle error if necessary
      console.error(error)
    } finally {
      setIsLoading(false) // Set loading to false when the request completes
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <input type="text" name="name" />
      <button type="submit" disabled={isLoading}>
        {isLoading ? 'Loading...' : 'Submit'}
      </button>
    </form>
  )
}
```

```jsx filename="pages/index.jsx" switcher
import React, { useState } from 'react'

export default function Page() {
  const [isLoading, setIsLoading] = useState(false)

  async function onSubmit(event) {
    event.preventDefault()
    setIsLoading(true) // Set loading to true when the request starts

    try {
      const formData = new FormData(event.currentTarget)
      const response = await fetch('/api/submit', {
        method: 'POST',
        body: formData,
      })

      // Handle response if necessary
      const data = await response.json()
      // ...
    } catch (error) {
      // Handle error if necessary
      console.error(error)
    } finally {
      setIsLoading(false) // Set loading to false when the request completes
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <input type="text" name="name" />
      <button type="submit" disabled={isLoading}>
        {isLoading ? 'Loading...' : 'Submit'}
      </button>
    </form>
  )
}
```

</PagesOnly>

### Error Handling

<AppOnly>

Server Actions can also return [serializable objects](https://developer.mozilla.org/docs/Glossary/Serialization). For example, your Server Action might handle errors from creating a new item:

```ts filename="app/actions.ts" switcher
'use server'

export async function createTodo(prevState: any, formData: FormData) {
  try {
    await createItem(formData.get('todo'))
    return revalidatePath('/')
  } catch (e) {
    return { message: 'Failed to create' }
  }
}
```

```js filename="app/actions.js" switcher
'use server'

export async function createTodo(prevState, formData) {
  try {
    await createItem(formData.get('todo'))
    return revalidatePath('/')
  } catch (e) {
    return { message: 'Failed to create' }
  }
}
```

Then, from a Client Component, you can read this value and display an error message.

```tsx filename="app/add-form.tsx" switcher
'use client'

import { experimental_useFormState as useFormState } from 'react-dom'
import { experimental_useFormStatus as useFormStatus } from 'react-dom'
import { createTodo } from '@/app/actions'

const initialState = {
  message: null,
}

function SubmitButton() {
  const { pending } = useFormStatus()

  return (
    <button type="submit" aria-disabled={pending}>
      Add
    </button>
  )
}

export function AddForm() {
  const [state, formAction] = useFormState(createTodo, initialState)

  return (
    <form action={formAction}>
      <label htmlFor="todo">Enter Task</label>
      <input type="text" id="todo" name="todo" required />
      <SubmitButton />
      <p aria-live="polite" className="sr-only">
        {state?.message}
      </p>
    </form>
  )
}
```

```jsx filename="app/add-form.jsx" switcher
'use client'

import { experimental_useFormState as useFormState } from 'react-dom'
import { experimental_useFormStatus as useFormStatus } from 'react-dom'
import { createTodo } from '@/app/actions'

const initialState = {
  message: null,
}

function SubmitButton() {
  const { pending } = useFormStatus()

  return (
    <button type="submit" aria-disabled={pending}>
      Add
    </button>
  )
}

export function AddForm() {
  const [state, formAction] = useFormState(createTodo, initialState)

  return (
    <form action={formAction}>
      <label htmlFor="todo">Enter Task</label>
      <input type="text" id="todo" name="todo" required />
      <SubmitButton />
      <p aria-live="polite" className="sr-only">
        {state?.message}
      </p>
    </form>
  )
}
```

</AppOnly>

<PagesOnly>

You can use React state to show an error message when a form submission fails:

```tsx filename="pages/index.tsx" switcher
import React, { useState, FormEvent } from 'react'

export default function Page() {
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsLoading(true)
    setError(null) // Clear previous errors when a new request starts

    try {
      const formData = new FormData(event.currentTarget)
      const response = await fetch('/api/submit', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error('Failed to submit the data. Please try again.')
      }

      // Handle response if necessary
      const data = await response.json()
      // ...
    } catch (error) {
      // Capture the error message to display to the user
      setError(error.message)
      console.error(error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div>
      {error && <div style={{ color: 'red' }}>{error}</div>}
      <form onSubmit={onSubmit}>
        <input type="text" name="name" />
        <button type="submit" disabled={isLoading}>
          {isLoading ? 'Loading...' : 'Submit'}
        </button>
      </form>
    </div>
  )
}
```

```jsx filename="pages/index.jsx" switcher
import React, { useState } from 'react'

export default function Page() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)

  async function onSubmit(event) {
    event.preventDefault()
    setIsLoading(true)
    setError(null) // Clear previous errors when a new request starts

    try {
      const formData = new FormData(event.currentTarget)
      const response = await fetch('/api/submit', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error('Failed to submit the data. Please try again.')
      }

      // Handle response if necessary
      const data = await response.json()
      // ...
    } catch (error) {
      // Capture the error message to display to the user
      setError(error.message)
      console.error(error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div>
      {error && <div style={{ color: 'red' }}>{error}</div>}
      <form onSubmit={onSubmit}>
        <input type="text" name="name" />
        <button type="submit" disabled={isLoading}>
          {isLoading ? 'Loading...' : 'Submit'}
        </button>
      </form>
    </div>
  )
}
```

</PagesOnly>

<AppOnly>

### Optimistic Updates

Use `useOptimistic` to optimistically update the UI before the Server Action finishes, rather than waiting for the response:

```tsx filename="app/page.tsx" switcher
'use client'

import { experimental_useOptimistic as useOptimistic } from 'react'
import { send } from './actions'

type Message = {
  message: string
}

export function Thread({ messages }: { messages: Message[] }) {
  const [optimisticMessages, addOptimisticMessage] = useOptimistic<Message[]>(
    messages,
    (state: Message[], newMessage: string) => [
      ...state,
      { message: newMessage },
    ]
  )

  return (
    <div>
      {optimisticMessages.map((m, k) => (
        <div key={k}>{m.message}</div>
      ))}
      <form
        action={async (formData: FormData) => {
          const message = formData.get('message')
          addOptimisticMessage(message)
          await send(message)
        }}
      >
        <input type="text" name="message" />
        <button type="submit">Send</button>
      </form>
    </div>
  )
}
```

```jsx filename="app/page.jsx" switcher
'use client'

import { experimental_useOptimistic as useOptimistic } from 'react'
import { send } from './actions'

export function Thread({ messages }) {
  const [optimisticMessages, addOptimisticMessage] = useOptimistic(
    messages,
    (state, newMessage) => [...state, { message: newMessage }]
  )

  return (
    <div>
      {optimisticMessages.map((m) => (
        <div>{m.message}</div>
      ))}
      <form
        action={async (formData) => {
          const message = formData.get('message')
          addOptimisticMessage(message)
          await send(message)
        }}
      >
        <input type="text" name="message" />
        <button type="submit">Send</button>
      </form>
    </div>
  )
}
```

</AppOnly>

### Setting Cookies

<PagesOnly>

You can set cookies inside an API Route using the `setHeader` method on the response:

```ts filename="pages/api/cookie.ts" switcher
import type { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  res.setHeader('Set-Cookie', 'username=lee; Path=/; HttpOnly')
  res.status(200).send('Cookie has been set.')
}
```

```js filename="pages/api/cookie.js" switcher
export default async function handler(req, res) {
  res.setHeader('Set-Cookie', 'username=lee; Path=/; HttpOnly')
  res.status(200).send('Cookie has been set.')
}
```

</PagesOnly>

<AppOnly>

You can set cookies inside a Server Action using the [`cookies`](/docs/app/api-reference/functions/cookies) function:

```ts filename="app/actions.ts" switcher
'use server'

import { cookies } from 'next/headers'

export async function create() {
  const cart = await createCart()
  cookies().set('cartId', cart.id)
}
```

```js filename="app/actions.js" switcher
'use server'

import { cookies } from 'next/headers'

export async function create() {
  const cart = await createCart()
  cookies().set('cartId', cart.id)
}
```

</AppOnly>

### Reading Cookies

<PagesOnly>

You can read cookies inside an API Route using the [`cookies`](/docs/pages/building-your-application/routing/api-routes#request-helpers) request helper:

```ts filename="pages/api/cookie.ts" switcher
import type { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const auth = req.cookies.authorization
  // ...
}
```

```js filename="pages/api/cookie.js" switcher
export default async function handler(req, res) {
  const auth = req.cookies.authorization
  // ...
}
```

</PagesOnly>

<AppOnly>

You can read cookies inside a Server Action using the [`cookies`](/docs/app/api-reference/functions/cookies) function:

```ts filename="app/actions.ts" switcher
'use server'

import { cookies } from 'next/headers'

export async function read() {
  const auth = cookies().get('authorization')?.value
  // ...
}
```

```js filename="app/actions.js" switcher
'use server'

import { cookies } from 'next/headers'

export async function read() {
  const auth = cookies().get('authorization')?.value
  // ...
}
```

</AppOnly>

### Deleting Cookies

<PagesOnly>

You can delete cookies inside an API Route using the `setHeader` method on the response:

```ts filename="pages/api/cookie.ts" switcher
import type { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  res.setHeader('Set-Cookie', 'username=; Path=/; HttpOnly; Max-Age=0')
  res.status(200).send('Cookie has been deleted.')
}
```

```js filename="pages/api/cookie.js" switcher
export default async function handler(req, res) {
  res.setHeader('Set-Cookie', 'username=; Path=/; HttpOnly; Max-Age=0')
  res.status(200).send('Cookie has been deleted.')
}
```

</PagesOnly>

<AppOnly>

You can delete cookies inside a Server Action using the [`cookies`](/docs/app/api-reference/functions/cookies) function:

```ts filename="app/actions.ts" switcher
'use server'

import { cookies } from 'next/headers'

export async function delete() {
  cookies().delete('name')
  // ...
}
```

```js filename="app/actions.js" switcher
'use server'

import { cookies } from 'next/headers'

export async function delete() {
  cookies().delete('name')
  // ...
}
```

See [additional examples](/docs/app/api-reference/functions/cookies#deleting-cookies) for deleting cookies from Server Actions.

</AppOnly>
