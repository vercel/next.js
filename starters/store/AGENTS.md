# Store starter

A store on Cache Components: the catalog is cached and shared, the cart reads cookies per request, and product pages prerender with the cart as the one dynamic hole.

## Where things are

- `features/products/products-queries.ts` — cached catalog reads (`"use cache"`, `cacheLife`, `cacheTag`); `getProduct` calls `notFound()`.
- `features/cart/cart-queries.ts` — the cookie-backed cart, never cached.
- `features/cart/cart-actions.ts` — cart mutations that set the cookie.
- `features/cart/components/cart-provider.tsx` — shares the cart count through context and increments it optimistically on add.
- `features/cart/components/cart-badge.tsx` — the dynamic cart count, streamed in the layout and read through the provider.
- `app/products/[slug]/page.tsx` — reads `params` with `params.then()` inside `<Suspense>`.

## Docs

- [Cache Components](https://nextjs.org/docs/app/getting-started/caching)
- [Instant navigation](https://nextjs.org/docs/app/guides/instant-navigation)
- [Forms](https://nextjs.org/docs/app/guides/forms)
- [How revalidation works](https://nextjs.org/docs/app/guides/how-revalidation-works)

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
