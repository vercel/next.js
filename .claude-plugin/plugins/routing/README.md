# Next.js Routing Skill

Expert guidance for Next.js App Router routing, navigation, and URL handling.

## Installation

This skill is automatically available when using Claude in a Next.js project.

## What's Included

| File | Purpose |
|------|---------|
| `SKILL.md` | Core concepts, quick start, activation rules |
| `REFERENCE.md` | API documentation for Link, useRouter, usePathname, etc. |
| `PATTERNS.md` | Common patterns like active links, search state, loading states |
| `ANTI-PATTERNS.md` | Mistakes to avoid with examples |
| `TROUBLESHOOTING.md` | Error solutions and debugging tips |

## Activation

This skill activates when you:
- Create pages or layouts (`page.tsx`, `layout.tsx`)
- Work with navigation (`<Link>`, `useRouter`)
- Handle dynamic routes (`[slug]`)
- Manage URL state (`usePathname`, `useSearchParams`)

## Key APIs

- `<Link>` - Client-side navigation with prefetching
- `useRouter` - Programmatic navigation
- `usePathname` - Read current URL path
- `useSearchParams` - Read query parameters

## Quick Example

```tsx
import Link from 'next/link'

export default function Nav() {
  return (
    <nav>
      <Link href="/">Home</Link>
      <Link href="/about">About</Link>
    </nav>
  )
}
```
