# Next.js Routing Patterns & Recipes

## Pattern 1: Active Link Styling

Highlight the current navigation item based on URL pathname.

```typescript
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navItems = [
  { href: '/', label: 'Home' },
  { href: '/about', label: 'About' },
  { href: '/blog', label: 'Blog' },
]

export function Navigation() {
  const pathname = usePathname()

  return (
    <nav>
      {navItems.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          className={pathname === href ? 'text-blue-600 font-bold' : 'text-gray-600'}
        >
          {label}
        </Link>
      ))}
    </nav>
  )
}
```

### When to Use

- Navigation menus with active state
- Sidebar with current section highlighted
- Breadcrumbs showing current location

### Key Points

- `usePathname()` returns the current path without query string
- For nested routes, use `pathname.startsWith(href)` for partial matching
- Must be a Client Component

---

## Pattern 2: Dynamic Route with Static Generation

Pre-render dynamic pages at build time for better performance.

```typescript
// app/blog/[slug]/page.tsx
import { notFound } from 'next/navigation'

// Generate static pages for all posts
export async function generateStaticParams() {
  const posts = await getPosts()
  return posts.map((post) => ({ slug: post.slug }))
}

export default async function BlogPost({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const post = await getPost(slug)

  if (!post) notFound()

  return (
    <article>
      <h1>{post.title}</h1>
      <div>{post.content}</div>
    </article>
  )
}
```

### When to Use

- Blog posts, product pages with known URLs
- Documentation pages
- Any content that can be determined at build time

### Key Points

- `generateStaticParams` runs at build time
- Unknown slugs trigger dynamic rendering or 404
- Combine with `revalidate` for ISR

---

## Pattern 3: Search with URL State

Persist search/filter state in URL for shareable links.

```typescript
'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { Suspense, useCallback } from 'react'

function SearchBox() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const createQueryString = useCallback(
    (name: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      params.set(name, value)
      return params.toString()
    },
    [searchParams]
  )

  return (
    <input
      type="search"
      defaultValue={searchParams.get('q') ?? ''}
      onChange={(e) => {
        router.push(pathname + '?' + createQueryString('q', e.target.value))
      }}
      placeholder="Search..."
    />
  )
}

export default function SearchPage() {
  return (
    <Suspense fallback={<input disabled placeholder="Loading..." />}>
      <SearchBox />
    </Suspense>
  )
}
```

### When to Use

- Search pages with shareable URLs
- Filters that should persist on refresh
- Pagination state

### Key Points

- Always wrap `useSearchParams` in Suspense
- Use `URLSearchParams` to build query strings
- `router.push` updates URL and triggers navigation

---

## Pattern 4: Loading State for Dynamic Routes

Show instant feedback while dynamic content loads.

```typescript
// app/dashboard/loading.tsx
export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="h-8 bg-gray-200 rounded w-1/4 mb-4" />
      <div className="h-4 bg-gray-200 rounded w-full mb-2" />
      <div className="h-4 bg-gray-200 rounded w-3/4" />
    </div>
  )
}

// app/dashboard/page.tsx
export default async function Dashboard() {
  const data = await fetchDashboardData() // Slow fetch

  return (
    <div>
      <h1>{data.title}</h1>
      <p>{data.description}</p>
    </div>
  )
}
```

### When to Use

- Any dynamic route (data fetched at request time)
- Pages with slow data fetches
- Improving perceived performance

### Key Points

- `loading.tsx` enables streaming
- Layout and loading UI show immediately
- Page content streams in when ready

---

## Pattern 5: Programmatic Navigation After Action

Navigate after form submission or async operation.

```typescript
'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function CreatePostForm() {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setIsSubmitting(true)

    const formData = new FormData(e.currentTarget)
    const response = await createPost(formData)

    if (response.success) {
      router.push(`/blog/${response.slug}`)
      router.refresh() // Refresh server components
    }

    setIsSubmitting(false)
  }

  return (
    <form onSubmit={handleSubmit}>
      <input name="title" required />
      <textarea name="content" required />
      <button disabled={isSubmitting}>
        {isSubmitting ? 'Creating...' : 'Create Post'}
      </button>
    </form>
  )
}
```

### When to Use

- Form submissions that redirect on success
- Multi-step flows
- Actions that change data and need to show updated page

### Key Points

- Use `router.push()` for programmatic navigation
- Call `router.refresh()` to re-fetch Server Component data
- Prefer Server Actions for form handling when possible

---

## Pattern 6: Catch-All Routes

Handle multiple path segments with a single route.

```typescript
// app/docs/[...slug]/page.tsx
export default async function DocsPage({
  params,
}: {
  params: Promise<{ slug: string[] }>
}) {
  const { slug } = await params
  // slug = ['getting-started', 'installation'] for /docs/getting-started/installation

  const path = slug.join('/')
  const doc = await getDoc(path)

  return (
    <article>
      <h1>{doc.title}</h1>
      <div>{doc.content}</div>
    </article>
  )
}

// For optional catch-all (matches /docs too):
// app/docs/[[...slug]]/page.tsx
```

### When to Use

- Documentation with nested paths
- CMS pages with arbitrary depth
- File browser interfaces

### Key Points

- `[...slug]` captures all segments as array
- `[[...slug]]` is optional (matches parent too)
- Access segments via `params.slug` array
