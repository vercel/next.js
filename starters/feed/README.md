# Feed starter

A public feed built on [Cache Components](https://nextjs.org/docs/app/getting-started/caching): the first page prerenders in the static shell, more pages stream in on demand, and new posts appear right after you publish them.

## How to use

```bash
npx create-next-app@latest --example https://github.com/vercel/next.js/tree/canary/starters/feed my-feed
```

Then run the development server:

```bash
npm run dev
```

## What's inside

- `features/feed/feed-queries.ts` — the paginated data layer. `getFeed(page)` is a `"use cache"` read that takes one row past the page size to know whether there is more. The in-memory store is a stand-in for your database.
- `features/feed/feed-actions.ts` — `createPost` and `likePost` as Server Actions that call `updateTag("feed")`, so a new post or like shows immediately.
- `features/feed/components/feed.tsx` — renders each page in its own `<Suspense>` boundary; `load-more.tsx` advances the `?page` search param.
- `features/feed/components/composer.tsx` and `like-button.tsx` — posting with `useActionState` and optimistic likes.

`AGENTS.md` describes this architecture for AI coding agents, so features added by an agent follow the same conventions. See the [AI agents guide](https://nextjs.org/docs/app/guides/ai-agents).
