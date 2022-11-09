# Missing Navigation Context

#### Why This Error Occurred

This can happen when you have components that are shared between `pages/` and `app/` or were trying to use the `next/navigation` hooks outside the `app/` directory. Situations where you also render components outside a Next.js application (like in unit tests) can also trigger this error.

The following hooks can be affected by missing contexts:

- `useSearchParams()`
- `usePathname()`

When pages are automatically statically optimized (See [Automatic Static Optimization](https://nextjs.org/docs/advanced-features/automatic-static-optimization)) or are rendered as a fallback page (See [Fallback Pages](https://nextjs.org/docs/api-reference/data-fetching/get-static-paths#fallback-pages)) the `useSearchParams()` and `usePathname()` hooks will return `null` until hydration occurs.

> **Note**: These hooks will always return non-null when used in the `app/` directory.

#### Possible Ways to Fix It

If you're migrating components over from `pages/` to `app/`, you can take advantage of the compatibility hooks that are designed to be used in transition when components are shared between `pages/` and `app/`. Instead of writing:

```tsx
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
```

You would write:

```tsx
import { useRouter, useSearchParams, usePathname } from 'next/compat/navigation'
```

When the navigation contexts are not available, they will return `null` instead of throwing an error.

> **Note**: The `useRouter()` hook from `next/compat/navigation` will not return `null` when used in `pages/` as it's been made to be feature compatible with the pages router.

If you're unit testing components that rely on these hooks, you should mock the related hooks from `next/navigation` directly instead.
