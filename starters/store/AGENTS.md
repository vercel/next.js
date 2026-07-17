<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Store starter

A store on Cache Components: a cached, shared catalog with a per-visitor cart that streams into the static shell.

## Patterns

- [Cache Components](https://nextjs.org/docs/app/getting-started/caching): the cached catalog (`"use cache"`, `cacheLife`, `cacheTag`).
- [Instant navigation](https://nextjs.org/docs/app/guides/instant-navigation): a static shell with a streamed, per-request hole.
- [Forms](https://nextjs.org/docs/app/guides/forms): cart mutations with Server Actions.
- [How revalidation works](https://nextjs.org/docs/app/guides/how-revalidation-works): invalidating the catalog when it changes.

## Agentic development

The [`next-dev-loop`](.agents/skills/next-dev-loop/SKILL.md) skill is installed so an agent can verify changes at runtime: drive the browser, read the console, and inspect what rendered.
