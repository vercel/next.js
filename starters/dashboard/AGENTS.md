# Dashboard starter

An authenticated dashboard on Cache Components: per-user data is read through a data access layer and streamed, shared data is cached, and the app shell prerenders.

## Where things are

- `features/auth/auth-queries.ts` — `getCurrentUser()`, the data access layer. Reads the session with `"use cache: private"` and redirects to `/login` when there is none.
- `features/auth/components/user-provider.tsx` — passes the user promise to client components through context and `use()`.
- `features/auth/components/login-form.tsx` — the login form with `useActionState`.
- `features/dashboard/dashboard-queries.ts` — per-user reads (through `getCurrentUser`) next to cached shared data.
- `app/(app)/` — the authenticated layout and page; `app/login/` sits outside it.

## Docs

- [Authentication](https://nextjs.org/docs/app/guides/authentication)
- [Cache Components](https://nextjs.org/docs/app/getting-started/caching)
- [`use cache: private`](https://nextjs.org/docs/app/api-reference/directives/use-cache-private)
- [Data security](https://nextjs.org/docs/app/guides/data-security)
- [Streaming](https://nextjs.org/docs/app/guides/streaming)

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
