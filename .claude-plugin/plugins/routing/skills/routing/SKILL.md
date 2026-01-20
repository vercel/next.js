---
name: routing
description: |
  Expert guidance for Next.js App Router routing, navigation, and URL handling.

  **PROACTIVE ACTIVATION**: Use this skill automatically when working in Next.js App Router projects involving page creation, navigation, or URL management.

  **DETECTION**: Look for: `next/link`, `next/navigation`, `useRouter`, `usePathname`, `useSearchParams`, `app/`, `[slug]`, `page.tsx`, `layout.tsx`

  **USE CASES**: Creating pages/layouts, implementing navigation, dynamic routes, handling search params, programmatic navigation.
---

# Next.js Routing

> **Auto-activation**: Activates when working with pages, layouts, navigation, or URL handling in Next.js App Router projects.

## Core Concept

Next.js uses **file-system based routing** where folders define routes and special files (`page.tsx`, `layout.tsx`) create UI.

```
app/                      → Route Structure
├── page.tsx              → /
├── layout.tsx            → Root layout (required)
├── blog/
│   ├── page.tsx          → /blog
│   ├── layout.tsx        → Blog layout
│   └── [slug]/
│       └── page.tsx      → /blog/:slug (dynamic)
└── dashboard/
    ├── page.tsx          → /dashboard
    └── loading.tsx       → Loading UI
```

## Quick Start

```typescript
// app/page.tsx - Home page
export default function Home() {
  return <h1>Welcome</h1>
}

// app/layout.tsx - Root layout (required)
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

// app/blog/[slug]/page.tsx - Dynamic route
export default async function BlogPost({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <h1>Post: {slug}</h1>
}
```

## When to Use

- Creating new pages (`page.tsx`)
- Sharing UI across routes (`layout.tsx`)
- Dynamic routes with parameters (`[slug]`)
- Navigation between pages (`<Link>`, `useRouter`)
- Reading URL state (`usePathname`, `useSearchParams`)
- Loading states (`loading.tsx`)

## Code Generation Guidelines

1. **Always use `<Link>` for navigation** - provides prefetching and client-side transitions
2. **Import navigation hooks from `next/navigation`** - not `next/router`
3. **`params` is a Promise in Next.js 15** - always `await params`
4. **Root layout is required** - must include `<html>` and `<body>` tags
5. **Use `loading.tsx` for dynamic routes** - enables streaming and instant navigation
6. **Prefer `<Link>` over `useRouter`** - use `useRouter` only for programmatic navigation
7. **Wrap `useSearchParams` in Suspense** - prevents static rendering bailout

---

See also: [REFERENCE.md](REFERENCE.md) | [PATTERNS.md](PATTERNS.md) | [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
