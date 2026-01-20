# Next.js Routing Anti-Patterns

## Anti-Pattern 1: Using `<a>` Instead of `<Link>`

### The Mistake

```typescript
// BAD: Raw anchor tag causes full page reload
export function Navigation() {
  return (
    <nav>
      <a href="/about">About</a>
      <a href="/contact">Contact</a>
    </nav>
  )
}
```

### Why It's Wrong

- Full page reload instead of client-side transition
- No prefetching of the destination route
- Loss of client state (form inputs, scroll position)
- Slower perceived navigation

### The Fix

```typescript
// GOOD: Link component enables client-side navigation
import Link from 'next/link'

export function Navigation() {
  return (
    <nav>
      <Link href="/about">About</Link>
      <Link href="/contact">Contact</Link>
    </nav>
  )
}
```

### How to Detect

- Search for `<a href="/` in your codebase
- ESLint rule: `@next/next/no-html-link-for-pages`

---

## Anti-Pattern 2: Importing useRouter from Wrong Package

### The Mistake

```typescript
// BAD: Wrong import for App Router
'use client'

import { useRouter } from 'next/router' // WRONG!

export function MyComponent() {
  const router = useRouter()
  // This will error or behave unexpectedly
}
```

### Why It's Wrong

- `next/router` is for Pages Router only
- App Router requires `next/navigation`
- Will cause runtime errors or unexpected behavior

### The Fix

```typescript
// GOOD: Correct import for App Router
'use client'

import { useRouter } from 'next/navigation'

export function MyComponent() {
  const router = useRouter()
  router.push('/dashboard')
}
```

### How to Detect

- Search for `from 'next/router'` in app/ directory
- Will throw error: "NextRouter was not mounted"

---

## Anti-Pattern 3: Not Awaiting params in Next.js 15

### The Mistake

```typescript
// BAD: params is a Promise in Next.js 15
export default function Page({ params }: { params: { slug: string } }) {
  return <h1>Post: {params.slug}</h1> // undefined or error
}
```

### Why It's Wrong

- In Next.js 15, `params` is a Promise
- Accessing directly returns a Promise object, not the value
- Will render `[object Promise]` or cause type errors

### The Fix

```typescript
// GOOD: Await params properly
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return <h1>Post: {slug}</h1>
}
```

### How to Detect

- TypeScript will flag the incorrect type
- Runtime: slug shows as `[object Promise]`

---

## Anti-Pattern 4: useSearchParams Without Suspense

### The Mistake

```typescript
// BAD: Causes entire page to bail out of static rendering
'use client'

import { useSearchParams } from 'next/navigation'

export default function SearchPage() {
  const searchParams = useSearchParams()

  return <div>Query: {searchParams.get('q')}</div>
}
```

### Why It's Wrong

- `useSearchParams` opts the nearest Suspense boundary out of static rendering
- Without a boundary, the entire page becomes dynamic
- Increases server load and slows initial page load

### The Fix

```typescript
// GOOD: Wrap in Suspense boundary
'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function SearchResults() {
  const searchParams = useSearchParams()
  return <div>Query: {searchParams.get('q')}</div>
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div>Loading search...</div>}>
      <SearchResults />
    </Suspense>
  )
}
```

### How to Detect

- Next.js dev mode shows warning about static rendering bailout
- Check if page is unexpectedly dynamic in build output

---

## Anti-Pattern 5: Missing loading.tsx for Dynamic Routes

### The Mistake

```typescript
// app/products/[id]/page.tsx
// BAD: No loading.tsx - user sees nothing while fetching
export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const product = await fetchProduct(id) // Slow fetch
  return <ProductDetails product={product} />
}
```

### Why It's Wrong

- User sees blank or old content while waiting
- No visual feedback that navigation is happening
- Dynamic routes can't be prefetched fully without loading state

### The Fix

```typescript
// app/products/[id]/loading.tsx
// GOOD: Add loading state
export default function Loading() {
  return <ProductSkeleton />
}

// app/products/[id]/page.tsx
export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const product = await fetchProduct(id)
  return <ProductDetails product={product} />
}
```

### How to Detect

- Navigation feels slow/unresponsive
- No visual feedback during route transitions
- Check for dynamic routes without sibling `loading.tsx`

---

## Anti-Pattern 6: Reading URL in Server Components

### The Mistake

```typescript
// BAD: Trying to read pathname in Server Component
// app/layout.tsx
export default function Layout({ children }) {
  const pathname = usePathname() // ERROR: hooks can't be used in Server Components

  return (
    <html>
      <body>
        <nav>{pathname === '/' ? 'Home' : 'Other'}</nav>
        {children}
      </body>
    </html>
  )
}
```

### Why It's Wrong

- `usePathname` is a Client Component hook
- Server Components can't use hooks
- URL reading requires client-side context

### The Fix

```typescript
// GOOD: Extract to Client Component
// app/components/nav.tsx
'use client'

import { usePathname } from 'next/navigation'

export function Nav() {
  const pathname = usePathname()
  return <nav>{pathname === '/' ? 'Home' : 'Other'}</nav>
}

// app/layout.tsx
import { Nav } from './components/nav'

export default function Layout({ children }) {
  return (
    <html>
      <body>
        <Nav />
        {children}
      </body>
    </html>
  )
}
```

### How to Detect

- Error: "You're importing a component that needs X"
- Error about hooks in Server Components
