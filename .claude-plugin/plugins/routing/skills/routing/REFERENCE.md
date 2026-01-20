# Next.js Routing API Reference

## Component: `<Link>`

### Import

```typescript
import Link from 'next/link'
```

### Signature

```typescript
<Link
  href={string | { pathname: string, query?: Record<string, string> }}
  replace?: boolean
  scroll?: boolean
  prefetch?: boolean | null
  onNavigate?: (e: { preventDefault: () => void }) => void
>
  {children}
</Link>
```

### Parameters

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `href` | `string \| object` | Path or URL to navigate to | (required) |
| `replace` | `boolean` | Replace history instead of push | `false` |
| `scroll` | `boolean` | Scroll to top on navigation | `true` |
| `prefetch` | `boolean \| null` | Prefetch the route | `null` (auto) |
| `onNavigate` | `function` | Callback during client-side navigation | - |

### Return Value

Renders an `<a>` element with prefetching and client-side navigation.

### Rules

1. Always use `<Link>` instead of `<a>` for internal navigation
2. `href` can be a string or object with `pathname` and `query`
3. Standard `<a>` attributes (`className`, `target`) pass through
4. `prefetch={null}` (default) auto-prefetches static routes fully, dynamic routes partially

### Examples

```typescript
// Basic navigation
<Link href="/about">About</Link>

// With query params
<Link href={{ pathname: '/search', query: { q: 'next' } }}>Search</Link>

// Replace history (no back button)
<Link href="/login" replace>Login</Link>

// Disable scroll reset
<Link href="/dashboard" scroll={false}>Dashboard</Link>

// Disable prefetch for large lists
<Link href={`/item/${id}`} prefetch={false}>{name}</Link>
```

---

## Hook: `useRouter`

### Import

```typescript
import { useRouter } from 'next/navigation'
```

### Signature

```typescript
const router = useRouter()

router.push(href: string, options?: { scroll?: boolean }): void
router.replace(href: string, options?: { scroll?: boolean }): void
router.refresh(): void
router.prefetch(href: string): void
router.back(): void
router.forward(): void
```

### Rules

1. Must be used in a Client Component (`'use client'`)
2. Import from `next/navigation`, NOT `next/router`
3. Prefer `<Link>` for declarative navigation
4. Use `router.refresh()` to re-fetch Server Components

### Examples

```typescript
'use client'

import { useRouter } from 'next/navigation'

export default function LoginButton() {
  const router = useRouter()

  async function handleLogin() {
    await login()
    router.push('/dashboard')
  }

  return <button onClick={handleLogin}>Login</button>
}
```

---

## Hook: `usePathname`

### Import

```typescript
import { usePathname } from 'next/navigation'
```

### Signature

```typescript
const pathname: string = usePathname()
```

### Return Value

| URL | Returned value |
|-----|----------------|
| `/` | `'/'` |
| `/dashboard` | `'/dashboard'` |
| `/dashboard?v=2` | `'/dashboard'` |
| `/blog/hello-world` | `'/blog/hello-world'` |

### Rules

1. Must be used in a Client Component
2. Returns only the pathname (no query string)
3. Cannot be read from Server Components

### Examples

```typescript
'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'

export function NavLink({ href, children }) {
  const pathname = usePathname()
  const isActive = pathname === href

  return (
    <Link href={href} className={isActive ? 'active' : ''}>
      {children}
    </Link>
  )
}
```

---

## Hook: `useSearchParams`

### Import

```typescript
import { useSearchParams } from 'next/navigation'
```

### Signature

```typescript
const searchParams: ReadonlyURLSearchParams = useSearchParams()
```

### Rules

1. Must be used in a Client Component
2. Returns a read-only `URLSearchParams` object
3. **Wrap in `<Suspense>`** to prevent static rendering bailout
4. For server-side access, use the `searchParams` page prop instead

### Examples

```typescript
'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function SearchFilters() {
  const searchParams = useSearchParams()
  const query = searchParams.get('q')

  return <input defaultValue={query ?? ''} />
}

// Always wrap in Suspense
export default function Page() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <SearchFilters />
    </Suspense>
  )
}
```

---

## File Convention: `page.tsx`

### Signature

```typescript
export default function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  // ...
}
```

### Rules

1. Must be a default export
2. `params` and `searchParams` are Promises in Next.js 15 - must `await`
3. Using `searchParams` opts into dynamic rendering

---

## File Convention: `layout.tsx`

### Signature

```typescript
export default function Layout({
  children,
}: {
  children: React.ReactNode
}) {
  // ...
}
```

### Rules

1. Root layout MUST include `<html>` and `<body>` tags
2. Layouts preserve state across navigations
3. Layouts can access `params` but NOT `searchParams`
4. Layouts do not re-render when child routes change
