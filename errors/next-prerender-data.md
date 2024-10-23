---
title: Cannot access data without either defining a fallback UI to use while the data loads or caching the data
---

#### Why This Error Occurred

When the experimental flag `dynamicIO` is enabled, Next.js expects you to explicitly describe whether data accessed during render should be evaluated ahead of time, while prerendering, or at Request time while rendering.

Data in this context refers to both reading from the request using Next.js built-in Request functions like `cookies()`, `headers()`, `draftMode()`, and `connection()` functions, Next.js built-in request props `params`, and `searchParams`, as well as any asynchronous data fetching technique such as `fetch()` or other network request library or database clients and more.

By default, any data accessed during render is treated as if it should be evaluated at request time. To explicitly communicate to Next.js that some data should be prerenderable, you must explicitly cache it using `"use cache"` or `unstable_cache`.

However, even if you have carefully ensured that a route is fully or partially prerenderable, it's possible to inadvertently make it non-prerenderable by introducing a new data dependency that hasn't been cached. To prevent this, Next.js requires that data accessed without caching must be inside a Suspense boundary that defines a fallback UI to use while loading this data.

This makes React's `Suspense` component an explicit opt-in to allow uncached data access.

To ensure you have a fully prerenderable route, you should omit any Suspense boundaries in your route. Suspense is useful for loading UI dynamically but if you have entirely prerenderable pages there is no need to have fallback UI because the primary UI will always be available.

To allow uncached data anywhere in your application, you can add a Suspense boundary inside your `<body>` tag in your Root Layout. However, we don't recommend you do this because you will likely want to scope Suspense boundaries around more granular component boundaries that provide fallback UI specific to individual Components.

Hybrid applications will typically use a combination of both techniques, with your top level shared Layouts being prerendered for static pages (without Suspense), and your layouts that actually have data dependencies defining fallback UI.

> **Note**: While external data can be accessed inside `"use cache"` and `unstable_cache()`, Request data such as `cookies()` cannot because we don't know about cookies before a Request actually occurs. If your application needs to read cookies the only recourse you have is to opt into allowing this data read using `Suspense`.

#### Possible Ways to Fix It

If you are accessing external data that doesn't change often and your use case can tolerate stale results while revalidating the data after it gets too old, you should wrap the data fetch in a `"use cache"` function. This will instruct Next.js to cache this data and allow it to be accessed without defining a fallback UI for the component that is accessing this data.

Before:

```jsx filename="app/page.js"
async function getRecentArticles() {
  return db.query(...)
}

export default async function Page() {
  const articles = await getRecentArticles(token);
  return <ArticleList articles={articles}>
}
```

After:

```jsx filename="app/page.js"
async function getRecentArticles() {
  "use cache"
  // This cache can be revalidated by webhook or server action
  // when you call revalidateTag("articles")
  cacheTag("articles")
  // This cache will revalidate after an hour even if no explicit
  // revalidate instruction was received
  cacheLife('hours')
  return db.query(...)
}

export default async function Page() {
  const articles = await getRecentArticles(token);
  return <ArticleList articles={articles}>
}
```

If you are accessing external data that should be up to date on every single request, you should find an appropriate component to wrap in Suspense and provide a fallback UI to use while this data loads.

Before:

```jsx filename="app/page.js"
async function getLatestTransactions() {
  return db.query(...)
}

export default async function Page() {
  const transactions = await getLatestTransactions(token);
  return <TransactionList transactions={transactions}>
}
```

After:

```jsx filename="app/page.js"
import { Suspense } from 'react'

async function getLatestTransactions() {
  return db.query(...)
}

function TransactionSkeleton() {
  return <div>...</div>
}

export default async function Page() {
  const transactions = await getLatestTransactions(token);
  return (
    <Suspense fallback={<TransactionSkeleton />}>
      <TransactionList transactions={transactions}>
    </Suspense>
  )
}
```

If you are accessing request data like cookies you might be able to move the cookies call deeper into your component tree in a way that it already is accessed inside a Suspense boundary.

Before:

```jsx filename="app/inbox.js"
export async function Inbox({ token }) {
  const email = await getEmail(token)
  return (
    <ul>
      {email.map((e) => (
        <EmailRow key={e.id} />
      ))}
    </ul>
  )
}
```

```jsx filename="app/page.js"
import { cookies } from 'next/headers'

import { Inbox } from './inbox'

export default async function Page() {
  const token = (await cookies()).get('token')
  return (
    <Suspense fallback="loading your inbox...">
      <Inbox token={token}>
    </Suspense>
  )
}
```

After:

```jsx filename="app/inbox.js"
import { cookies } from 'next/headers'

export async function Inbox() {
  const token = (await cookies()).get('token')
  const email = await getEmail(token)
  return (
    <ul>
      {email.map((e) => (
        <EmailRow key={e.id} />
      ))}
    </ul>
  )
}
```

```jsx filename="app/page.js"
import { Inbox } from './inbox'

export default async function Page() {
  return (
    <Suspense fallback="loading your inbox...">
      <Inbox>
    </Suspense>
  )
}
```

If your request data cannot be moved, you must provide a Suspense boundary somewhere above this component.

### Useful Links

- [`Suspense` React API](https://react.dev/reference/react/Suspense)
- [`headers` function](https://nextjs.org/docs/app/api-reference/functions/headers)
- [`cookies` function](https://nextjs.org/docs/app/api-reference/functions/cookies)
- [`draftMode` function](https://nextjs.org/docs/app/api-reference/functions/draft-mode)
- [`connection` function](https://nextjs.org/docs/app/api-reference/functions/connection)
