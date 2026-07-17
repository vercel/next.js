# Chat starter

A hybrid chat app built on [Cache Components](https://nextjs.org/docs/app/getting-started/caching): the shell and conversation sidebar prerender, navigations are instant, and replies stream token by token from a Route Handler.

## How to use

```bash
npx create-next-app@latest --example https://github.com/vercel/next.js/tree/canary/starters/chat my-chat
```

Then run the development server:

```bash
npm run dev
```

## What's inside

- `features/chat/chat-queries.ts` — cached reads for the sidebar and a single conversation, invalidated by tag. The in-memory store is a stand-in for your database.
- `app/api/chat/route.ts` — the Route Handler that streams the completion and persists it.
- `features/chat/components/conversation.tsx` — the client view that streams replies and shows messages optimistically.
- `features/chat/components/new-chat.tsx` — the empty state with suggested prompts.
- `features/chat/ai.ts` — a stand-in model. Replace it with the [AI SDK](https://ai-sdk.dev) and keep the streaming shape.

`AGENTS.md` describes this architecture for AI coding agents, so features added by an agent follow the same conventions. See the [AI agents guide](https://nextjs.org/docs/app/guides/ai-agents).
