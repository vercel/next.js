# Chat starter

A hybrid chat app on Cache Components: the shell and conversation sidebar prerender, navigations between conversations are instant, and replies stream per request from a Route Handler.

## Where things are

- `features/chat/chat-queries.ts` — cached reads for the sidebar list and a single conversation; `getConversation` calls `notFound()`.
- `features/chat/chat-actions.ts` — `createConversation`, which starts a chat and redirects to it.
- `app/api/chat/route.ts` — streams the reply and persists it with `revalidateTag`.
- `features/chat/components/sidebar.tsx` — the conversation list, streamed in the layout.
- `features/chat/components/conversation.tsx` — the client view that streams replies and shows messages optimistically.
- `features/chat/components/new-chat.tsx` — the empty state with suggested prompts.
- `features/chat/ai.ts` — the model stand-in. Replace with the AI SDK and keep the streaming shape.

## Docs

- [Backend for frontend](https://nextjs.org/docs/app/guides/backend-for-frontend)
- [Single-page applications](https://nextjs.org/docs/app/guides/single-page-applications)
- [Interactive apps](https://nextjs.org/docs/app/guides/interactive-apps)
- [Cache Components](https://nextjs.org/docs/app/getting-started/caching)

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
