# with-framer-motion-app-router

Shared element transitions using Framer Motion with the Next.js App Router.

Key points:

- Use `app/template.tsx` as the client transition boundary with `AnimatePresence` and `LayoutGroup`.
- Mark motion-rendering components with `'use client'`.
- Use `initial={false}` on `AnimatePresence` to avoid SSR/client diffs.
- Prefer stable keys (e.g., `usePathname()`) for route transitions.
- Ensure shared elements use identical `layoutId` across routes.

Run locally:

```
pnpm install
pnpm dev
```

