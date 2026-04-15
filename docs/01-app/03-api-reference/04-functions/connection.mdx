---
title: connection
description: API Reference for the connection function.
---

The `connection()` function allows you to indicate rendering should wait for an incoming user request before continuing.

It's useful when a component doesn't use [Request-time APIs](/docs/app/glossary#request-time-apis) like `cookies` or `headers`, but still needs to produce different output per request, such as `Math.random()` or `new Date()`.

```ts filename="app/page.tsx" switcher
import { connection } from 'next/server'

export default async function Page() {
  await connection() // prerendering stops here
  // the following code only runs at request time
  const rand = Math.random()
  return <span>{rand}</span>
}
```

```jsx filename="app/page.js" switcher
import { connection } from 'next/server'

export default async function Page() {
  await connection() // prerendering stops here
  // the following code only runs at request time
  const rand = Math.random()
  return <span>{rand}</span>
}
```

## Examples

### Synchronous database drivers

Queries from synchronous database drivers like `better-sqlite3` complete during prerendering. If you are not already using Request-time APIs, call `connection()` before your query to exclude them from prerendering:

```ts filename="app/lib/data.ts" switcher
import { connection } from 'next/server'
import Database from 'better-sqlite3'

const db = new Database('app.db')

export async function getVisitorCount() {
  await connection()
  return db.prepare('SELECT value FROM counters WHERE name = ?').get('visitors')
}
```

```js filename="app/lib/data.js" switcher
import { connection } from 'next/server'
import Database from 'better-sqlite3'

const db = new Database('app.db')

export async function getVisitorCount() {
  await connection()
  return db.prepare('SELECT value FROM counters WHERE name = ?').get('visitors')
}
```

Now any component that calls `getVisitorCount()` will be excluded from prerendering, along with the rest of its output.

## Reference

### Type

```jsx
function connection(): Promise<void>
```

### Parameters

- The function does not accept any parameters.

### Returns

- The function returns a `void` Promise. It is not meant to be consumed.

## Good to know

- `connection` replaces [`unstable_noStore`](/docs/app/api-reference/functions/unstable_noStore) to better align with the future of Next.js.
- The function is only necessary when dynamic rendering is required and common Request-time APIs are not used.

### Version History

| Version      | Changes                  |
| ------------ | ------------------------ |
| `v15.0.0`    | `connection` stabilized. |
| `v15.0.0-RC` | `connection` introduced. |
