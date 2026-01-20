# Next.js Routing Troubleshooting

## Quick Debugging Checklist

- [ ] Using `next/navigation` (not `next/router`) for App Router?
- [ ] `params` and `searchParams` are awaited (Next.js 15)?
- [ ] Root layout has `<html>` and `<body>` tags?
- [ ] `useSearchParams` wrapped in Suspense boundary?
- [ ] Using `<Link>` instead of `<a>` for internal links?
- [ ] Client Components have `'use client'` directive?
- [ ] Dynamic routes have `loading.tsx` for better UX?

---

## Error: NextRouter was not mounted

### Symptoms

```
Error: NextRouter was not mounted. https://nextjs.org/docs/messages/next-router-not-mounted
```

### Cause

Using `next/router` (Pages Router) instead of `next/navigation` (App Router).

### Solution

```typescript
// Before (wrong)
import { useRouter } from 'next/router'

// After (correct)
import { useRouter } from 'next/navigation'
```

Update all imports in your app/ directory to use `next/navigation`.

---

## Error: Invariant: missing \_\_next in popstate state

### Symptoms

```
Error: Invariant: missing __next in popstate state
```

### Cause

Browser history state was manipulated incorrectly, usually by:
- Using `window.history.pushState/replaceState` with wrong state format
- Third-party library modifying history

### Solution

```typescript
// Use Next.js navigation APIs instead of raw history
import { useRouter } from 'next/navigation'

const router = useRouter()

// Instead of: window.history.pushState(null, '', '/new-path')
router.push('/new-path')

// If you must use native history, ensure state format:
window.history.pushState({ __next: true }, '', '/path')
```

---

## Error: Incompatible href and as values

### Symptoms

```
Error: The provided `as` value (/post-1/comments) is incompatible with the `href` value (/[post])
```

### Cause

When using the `as` prop, the path structure doesn't match the dynamic segments in `href`.

### Solution

```typescript
// Wrong: as has extra segments
<Link href="/[post]" as="/post-1/comments">

// Correct: as matches href structure
<Link href="/[post]" as="/post-1">

// Or use direct path without as
<Link href="/post-1">
```

In Next.js 10+, you usually don't need `as` - use the actual URL directly in `href`.

---

## Error: params is undefined

### Symptoms

- `params.slug` is undefined
- Type error: Cannot read property of undefined

### Cause

In Next.js 15, `params` is a Promise that must be awaited.

### Solution

```typescript
// Next.js 15+ - params is a Promise
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params // Must await!
  return <div>{slug}</div>
}
```

---

## Error: You're importing a component that needs usePathname

### Symptoms

```
Error: You're importing a component that needs usePathname. It only works in a Client Component.
```

### Cause

Using `usePathname` (or other navigation hooks) in a Server Component.

### Solution

```typescript
// 1. Add 'use client' directive
'use client'

import { usePathname } from 'next/navigation'

// 2. Or extract to a Client Component
// server-component.tsx
import { ClientNav } from './client-nav'
export default function Page() {
  return <ClientNav />
}

// client-nav.tsx
'use client'
import { usePathname } from 'next/navigation'
export function ClientNav() {
  const pathname = usePathname()
  // ...
}
```

---

## Error: searchParams should be awaited before using its value

### Symptoms

```
Warning: searchParams is a Promise. Accessing its properties directly will return empty values.
```

### Cause

In Next.js 15, `searchParams` in page props is a Promise.

### Solution

```typescript
// Before (Next.js 14)
export default function Page({ searchParams }) {
  const query = searchParams.q
}

// After (Next.js 15)
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
}
```

---

## Issue: Page is unexpectedly dynamic

### Symptoms

- Build output shows page as `ƒ` (dynamic) instead of `○` (static)
- Page renders slowly on each request

### Cause

Common causes of dynamic rendering:
- Using `searchParams` without Suspense
- Calling `cookies()` or `headers()`
- Accessing `request` in layout/page

### Solution

```typescript
// 1. Isolate dynamic parts in Suspense
<Suspense fallback={<Loading />}>
  <DynamicComponent />
</Suspense>

// 2. Use generateStaticParams for known paths
export async function generateStaticParams() {
  return posts.map((post) => ({ slug: post.slug }))
}

// 3. Set dynamic behavior explicitly
export const dynamic = 'force-static' // or 'force-dynamic'
```

---

## Issue: Navigation feels slow

### Symptoms

- Clicking links has noticeable delay
- No loading indicator during navigation

### Cause

- Missing `loading.tsx` for dynamic routes
- Prefetching disabled or not working
- Slow data fetching without streaming

### Solution

```typescript
// 1. Add loading.tsx for dynamic routes
// app/dashboard/loading.tsx
export default function Loading() {
  return <Skeleton />
}

// 2. Ensure prefetch is enabled (default)
<Link href="/dashboard">Dashboard</Link>

// 3. Use useLinkStatus for slow networks
'use client'
import { useLinkStatus } from 'next/link'

function LoadingIndicator() {
  const { pending } = useLinkStatus()
  return pending ? <Spinner /> : null
}
```

---

## Performance Tips

1. **Use `loading.tsx`** for all dynamic routes - enables streaming and instant navigation feel
2. **Pre-render when possible** - use `generateStaticParams` for known dynamic routes
3. **Prefetch wisely** - default prefetch is good; disable only for huge lists
4. **Colocate data fetching** - fetch in the component that needs the data
5. **Minimize client components** - keep navigation components small
6. **Use parallel routes** - load independent sections simultaneously
7. **Implement ISR** - use `revalidate` for frequently updated content
