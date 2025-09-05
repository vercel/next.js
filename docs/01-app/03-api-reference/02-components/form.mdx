---
title: Form Component
description: Learn how to use the `<Form>` component to handle form submissions and search params updates with client-side navigation.
---

The `<Form>` component extends the HTML `<form>` element to provide <AppOnly>[**prefetching**](/docs/app/getting-started/linking-and-navigating#prefetching) of [loading UI](/docs/app/api-reference/file-conventions/loading),</AppOnly> **client-side navigation** on submission, and **progressive enhancement**.

It's useful for forms that update URL search params as it reduces the boilerplate code needed to achieve the above.

Basic usage:

<AppOnly>

```tsx filename="/app/ui/search.tsx" switcher
import Form from 'next/form'

export default function Page() {
  return (
    <Form action="/search">
      {/* On submission, the input value will be appended to
          the URL, e.g. /search?query=abc */}
      <input name="query" />
      <button type="submit">Submit</button>
    </Form>
  )
}
```

```jsx filename="/app/ui/search.js" switcher
import Form from 'next/form'

export default function Search() {
  return (
    <Form action="/search">
      {/* On submission, the input value will be appended to
          the URL, e.g. /search?query=abc */}
      <input name="query" />
      <button type="submit">Submit</button>
    </Form>
  )
}
```

</AppOnly>

<PagesOnly>

```tsx filename="/ui/search.js" switcher
import Form from 'next/form'

export default function Page() {
  return (
    <Form action="/search">
      {/* On submission, the input value will be appended to
          the URL, e.g. /search?query=abc */}
      <input name="query" />
      <button type="submit">Submit</button>
    </Form>
  )
}
```

```jsx filename="/ui/search.js" switcher
import Form from 'next/form'

export default function Search() {
  return (
    <Form action="/search">
      {/* On submission, the input value will be appended to
          the URL, e.g. /search?query=abc */}
      <input name="query" />
      <button type="submit">Submit</button>
    </Form>
  )
}
```

</PagesOnly>

## Reference

The behavior of the `<Form>` component depends on whether the `action` prop is passed a `string` or `function`.

<AppOnly>

- When `action` is a **string**, the `<Form>` behaves like a native HTML form that uses a **`GET`** method. The form data is encoded into the URL as search params, and when the form is submitted, it navigates to the specified URL. In addition, Next.js:
  - [Prefetches](/docs/app/getting-started/linking-and-navigating#prefetching) the path when the form becomes visible, this preloads shared UI (e.g. `layout.js` and `loading.js`), resulting in faster navigation.
  - Performs a [client-side navigation](/docs/app/getting-started/linking-and-navigating#client-side-transitions) instead of a full page reload when the form is submitted. This retains shared UI and client-side state.
- When `action` is a **function** (Server Action), `<Form>` behaves like a [React form](https://react.dev/reference/react-dom/components/form), executing the action when the form is submitted.

</AppOnly>

<PagesOnly>

- When `action` is a **string**, the `<Form>` behaves like a native HTML form that uses a **`GET`** method. The form data is encoded into the URL as search params, and when the form is submitted, it navigates to the specified URL. In addition, Next.js:
  - Performs a [client-side navigation](/docs/app/getting-started/linking-and-navigating#client-side-transitions) instead of a full page reload when the form is submitted. This retains shared UI and client-side state.

</PagesOnly>

### `action` (string) Props

<PagesOnly>

When `action` is a string, the `<Form>` component supports the following props:

| Prop      | Example            | Type                            | Required |
| --------- | ------------------ | ------------------------------- | -------- |
| `action`  | `action="/search"` | `string` (URL or relative path) | Yes      |
| `replace` | `replace={false}`  | `boolean`                       | -        |
| `scroll`  | `scroll={true}`    | `boolean`                       | -        |

- **`action`**: The URL or path to navigate to when the form is submitted.
  - An empty string `""` will navigate to the same route with updated search params.
- **`replace`**: Replaces the current history state instead of pushing a new one to the [browser's history](https://developer.mozilla.org/en-US/docs/Web/API/History_API) stack. Default is `false`.
- **`scroll`**: Controls the scroll behavior during navigation. Defaults to `true`, this means it will scroll to the top of the new route, and maintain the scroll position for backwards and forwards navigation.

</PagesOnly>

<AppOnly>

When `action` is a string, the `<Form>` component supports the following props:

| Prop       | Example            | Type                            | Required |
| ---------- | ------------------ | ------------------------------- | -------- |
| `action`   | `action="/search"` | `string` (URL or relative path) | Yes      |
| `replace`  | `replace={false}`  | `boolean`                       | -        |
| `scroll`   | `scroll={true}`    | `boolean`                       | -        |
| `prefetch` | `prefetch={true}`  | `boolean`                       | -        |

- **`action`**: The URL or path to navigate to when the form is submitted.
  - An empty string `""` will navigate to the same route with updated search params.
- **`replace`**: Replaces the current history state instead of pushing a new one to the [browser's history](https://developer.mozilla.org/en-US/docs/Web/API/History_API) stack. Default is `false`.
- **`scroll`**: Controls the scroll behavior during navigation. Defaults to `true`, this means it will scroll to the top of the new route, and maintain the scroll position for backwards and forwards navigation.
- **`prefetch`**: Controls whether the path should be prefetched when the form becomes visible in the user's viewport. Defaults to `true`.

### `action` (function) Props

When `action` is a function, the `<Form>` component supports the following prop:

| Prop     | Example             | Type                       | Required |
| -------- | ------------------- | -------------------------- | -------- |
| `action` | `action={myAction}` | `function` (Server Action) | Yes      |

- **`action`**: The Server Action to be called when the form is submitted. See the [React docs](https://react.dev/reference/react-dom/components/form#props) for more.

> **Good to know**: When `action` is a function, the `replace` and `scroll` props are ignored.

</AppOnly>

### Caveats

<AppOnly>

- **`formAction`**: Can be used in a `<button>` or `<input type="submit">` fields to override the `action` prop. Next.js will perform a client-side navigation, however, this approach doesn't support prefetching.
  - When using [`basePath`](/docs/app/api-reference/config/next-config-js/basePath), you must also include it in the `formAction` path. e.g. `formAction="/base-path/search"`.
- **`key`**: Passing a `key` prop to a string `action` is not supported. If you'd like to trigger a re-render or perform a mutation, consider using a function `action` instead.

</AppOnly>

- **`onSubmit`**: Can be used to handle form submission logic. However, calling `event.preventDefault()` will override `<Form>` behavior such as navigating to the specified URL.
- **[`method`](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/form#method), [`encType`](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/form#enctype), [`target`](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/form#target)**: Are not supported as they override `<Form>` behavior.
  - Similarly, `formMethod`, `formEncType`, and `formTarget` can be used to override the `method`, `encType`, and `target` props respectively, and using them will fallback to native browser behavior.
  - If you need to use these props, use the HTML `<form>` element instead.
- **`<input type="file">`**: Using this input type when the `action` is a string will match browser behavior by submitting the filename instead of the file object.

<AppOnly>

## Examples

### Search form that leads to a search result page

You can create a search form that navigates to a search results page by passing the path as an `action`:

```tsx filename="/app/page.tsx" switcher
import Form from 'next/form'

export default function Page() {
  return (
    <Form action="/search">
      <input name="query" />
      <button type="submit">Submit</button>
    </Form>
  )
}
```

```jsx filename="/app/page.js" switcher
import Form from 'next/form'

export default function Page() {
  return (
    <Form action="/search">
      <input name="query" />
      <button type="submit">Submit</button>
    </Form>
  )
}
```

When the user updates the query input field and submits the form, the form data will be encoded into the URL as search params, e.g. `/search?query=abc`.

> **Good to know**: If you pass an empty string `""` to `action`, the form will navigate to the same route with updated search params.

On the results page, you can access the query using the [`searchParams`](/docs/app/api-reference/file-conventions/page#searchparams-optional) `page.js` prop and use it to fetch data from an external source.

```tsx filename="/app/search/page.tsx" switcher
import { getSearchResults } from '@/lib/search'

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const results = await getSearchResults((await searchParams).query)

  return <div>...</div>
}
```

```jsx filename="/app/search/page.js" switcher
import { getSearchResults } from '@/lib/search'

export default async function SearchPage({ searchParams }) {
  const results = await getSearchResults((await searchParams).query)

  return <div>...</div>
}
```

When the `<Form>` becomes visible in the user's viewport, shared UI (such as `layout.js` and `loading.js`) on the `/search` page will be prefetched. On submission, the form will immediately navigate to the new route and show loading UI while the results are being fetched. You can design the fallback UI using [`loading.js`](/docs/app/api-reference/file-conventions/loading):

```tsx filename="/app/search/loading.tsx" switcher
export default function Loading() {
  return <div>Loading...</div>
}
```

```jsx filename="/app/search/loading.js" switcher
export default function Loading() {
  return <div>Loading...</div>
}
```

To cover cases when shared UI hasn't yet loaded, you can show instant feedback to the user using [`useFormStatus`](https://react.dev/reference/react-dom/hooks/useFormStatus).

First, create a component that displays a loading state when the form is pending:

```tsx filename="/app/ui/search-button.tsx" switcher
'use client'
import { useFormStatus } from 'react-dom'

export default function SearchButton() {
  const status = useFormStatus()
  return (
    <button type="submit">{status.pending ? 'Searching...' : 'Search'}</button>
  )
}
```

```jsx filename="/app/ui/search-button.js" switcher
'use client'
import { useFormStatus } from 'react-dom'

export default function SearchButton() {
  const status = useFormStatus()
  return (
    <button type="submit">{status.pending ? 'Searching...' : 'Search'}</button>
  )
}
```

Then, update the search form page to use the `SearchButton` component:

```tsx filename="/app/page.tsx" switcher
import Form from 'next/form'
import { SearchButton } from '@/ui/search-button'

export default function Page() {
  return (
    <Form action="/search">
      <input name="query" />
      <SearchButton />
    </Form>
  )
}
```

```jsx filename="/app/ui/search-button.js" switcher
import Form from 'next/form'
import { SearchButton } from '@/ui/search-button'

export default function Page() {
  return (
    <Form action="/search">
      <input name="query" />
      <SearchButton />
    </Form>
  )
}
```

### Mutations with Server Actions

You can perform mutations by passing a function to the `action` prop.

```tsx filename="/app/posts/create/page.tsx" switcher
import Form from 'next/form'
import { createPost } from '@/posts/actions'

export default function Page() {
  return (
    <Form action={createPost}>
      <input name="title" />
      {/* ... */}
      <button type="submit">Create Post</button>
    </Form>
  )
}
```

```jsx filename="/app/posts/create/page.js" switcher
import Form from 'next/form'
import { createPost } from '@/posts/actions'

export default function Page() {
  return (
    <Form action={createPost}>
      <input name="title" />
      {/* ... */}
      <button type="submit">Create Post</button>
    </Form>
  )
}
```

After a mutation, it's common to redirect to the new resource. You can use the [`redirect`](/docs/app/guides/redirecting) function from `next/navigation` to navigate to the new post page.

> **Good to know**: Since the "destination" of the form submission is not known until the action is executed, `<Form>` cannot automatically prefetch shared UI.

```tsx filename="/app/posts/actions.ts" switcher
'use server'
import { redirect } from 'next/navigation'

export async function createPost(formData: FormData) {
  // Create a new post
  // ...

  // Redirect to the new post
  redirect(`/posts/${data.id}`)
}
```

```jsx filename="/app/posts/actions.js" switcher
'use server'
import { redirect } from 'next/navigation'

export async function createPost(formData) {
  // Create a new post
  // ...

  // Redirect to the new post
  redirect(`/posts/${data.id}`)
}
```

Then, in the new page, you can fetch data using the `params` prop:

```tsx filename="/app/posts/[id]/page.tsx" switcher
import { getPost } from '@/posts/data'

export default async function PostPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const data = await getPost(id)

  return (
    <div>
      <h1>{data.title}</h1>
      {/* ... */}
    </div>
  )
}
```

```jsx filename="/app/posts/[id]/page.js" switcher
import { getPost } from '@/posts/data'

export default async function PostPage({ params }) {
  const { id } = await params
  const data = await getPost(id)

  return (
    <div>
      <h1>{data.title}</h1>
      {/* ... */}
    </div>
  )
}
```

See the [Server Actions](/docs/app/getting-started/updating-data) docs for more examples.

</AppOnly>
