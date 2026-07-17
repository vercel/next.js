# Blog starter

A minimal blog built on [Cache Components](https://nextjs.org/docs/app/getting-started/caching): reads are cached and tagged, pages prerender to static shells, and mutations invalidate by tag.

## How to use

```bash
npx create-next-app@latest --example https://github.com/vercel/next.js/tree/canary/starters/blog my-blog
```

Then run the development server:

```bash
npm run dev
```

## What's inside

- `features/posts/posts-queries.ts` — the data layer. All reads are `"use cache"` functions with `cacheLife` and `cacheTag`. The in-memory store is a stand-in for your database or CMS; replace its internals and keep the function signatures.
- `features/posts/posts-actions.ts` — mutations as Server Actions that call `updateTag`, so users see their own changes immediately.
- `app/blog/[slug]/page.tsx` — post pages prerendered for every known slug via `generateStaticParams`.
- `features/posts/components/` — async server components exporting a dimension-matched skeleton alongside each component, so streaming content reveals without layout shift.

`AGENTS.md` describes this architecture for AI coding agents, so features added by an agent follow the same caching conventions. See the [AI agents guide](https://nextjs.org/docs/app/guides/ai-agents).
