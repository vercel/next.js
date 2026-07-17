# Store starter

A minimal store built on [Cache Components](https://nextjs.org/docs/app/getting-started/caching): the product catalog is cached and shared, while the cart reads cookies per request and streams into the static shell.

## How to use

```bash
npx create-next-app@latest --example https://github.com/vercel/next.js/tree/canary/starters/store my-store
```

Then run the development server:

```bash
npm run dev
```

## What's inside

- `features/products/products-queries.ts` — the cached catalog. All reads go through `"use cache"` functions with `cacheLife` and `cacheTag`. The in-memory store is a stand-in for your database or commerce API.
- `features/cart/cart-queries.ts` — the per-visitor cart, read from cookies on every request and never cached.
- `features/cart/components/cart-badge.tsx` — the cart count in the layout header, streaming behind `<Suspense>` as the one dynamic hole in an otherwise static shell.
- `app/products/[slug]/page.tsx` — product pages prerendered for every known slug via `generateStaticParams`.

`AGENTS.md` describes this architecture for AI coding agents, so features added by an agent follow the same caching conventions. See the [AI agents guide](https://nextjs.org/docs/app/guides/ai-agents).
