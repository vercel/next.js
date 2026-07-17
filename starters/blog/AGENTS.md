# Blog starter

A blog on Cache Components: content is shared, so reads are cached and tagged, pages prerender to static shells, and mutations invalidate by tag.

## Where things are

- `features/posts/posts-queries.ts` — the data layer. Cached reads with `"use cache"`, `cacheLife`, and `cacheTag`; `getPost` calls `notFound()`.
- `features/posts/posts-actions.ts` — mutations that call `updateTag`.
- `features/posts/components/` — async server components, each exporting a matching skeleton.
- `app/blog/[slug]/page.tsx` — reads `params` with `params.then()` inside `<Suspense>`.

## Docs

- [Cache Components](https://nextjs.org/docs/app/getting-started/caching)
- [Public static pages](https://nextjs.org/docs/app/guides/public-static-pages)
- [How revalidation works](https://nextjs.org/docs/app/guides/how-revalidation-works)
- [MDX](https://nextjs.org/docs/app/guides/mdx)

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
