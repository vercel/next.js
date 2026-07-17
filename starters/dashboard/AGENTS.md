<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Dashboard starter

An authenticated dashboard on Cache Components: per-user data behind a data access layer, streamed in parallel, with shared data cached.

## Patterns

- [Authentication](https://nextjs.org/docs/app/guides/authentication): the data access layer and session handling.
- [`use cache: private`](https://nextjs.org/docs/app/api-reference/directives/use-cache-private): caching per-user reads off the shared server cache.
- [Data security](https://nextjs.org/docs/app/guides/data-security): keeping per-user reads safe.
- [Streaming](https://nextjs.org/docs/app/guides/streaming): parallel Suspense sections.

## Agentic development

The [`next-dev-loop`](.agents/skills/next-dev-loop/SKILL.md) skill is installed so an agent can verify changes at runtime: drive the browser, read the console, and inspect what rendered.
