<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Chat starter

A hybrid chat app on Cache Components: a prerendered shell with a streamed conversation sidebar, and replies stream per request from a Route Handler.

## Patterns

- [Backend for frontend](https://nextjs.org/docs/app/guides/backend-for-frontend): the streaming Route Handler.
- [Runtime prefetching](https://nextjs.org/docs/app/guides/runtime-prefetching): `allow-runtime` so a conversation loads instantly on navigation.
- [Interactive apps](https://nextjs.org/docs/app/guides/interactive-apps): optimistic messages and pending state.
- [Cache Components](https://nextjs.org/docs/app/getting-started/caching): caching shared reads like the sidebar.

## Agentic development

The [`next-dev-loop`](.agents/skills/next-dev-loop/SKILL.md) skill is installed so an agent can verify changes at runtime: drive the browser, read the console, and inspect what rendered.
