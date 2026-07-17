<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Feed starter

A feed on Cache Components: the first page prerenders in the static shell, more pages stream in on demand, and new posts show right away.

## Patterns

- [Cache Components](https://nextjs.org/docs/app/getting-started/caching): the cached, paginated reads.
- [How revalidation works](https://nextjs.org/docs/app/guides/how-revalidation-works): `updateTag` so a new post appears immediately.
- [Interactive apps](https://nextjs.org/docs/app/guides/interactive-apps): optimistic likes and pending state.
- [Forms](https://nextjs.org/docs/app/guides/forms): the composer with `useActionState`.

## Agentic development

The [`next-dev-loop`](.agents/skills/next-dev-loop/SKILL.md) skill is installed so an agent can verify changes at runtime: drive the browser, read the console, and inspect what rendered.
