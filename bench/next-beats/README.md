<div align="center">

<img src="public/logo.svg" alt="NextBeats" width="72" height="72" />

# NextBeats

A [Next.js 16.3](https://nextjs.org/blog/next-16-3-instant-navigations) music player demonstrating [Instant Navigations](https://preview.nextjs.org/docs/app/guides/instant-navigation).

[**Live demo →**](https://next-beats.dev)

</div>

---

## Features

- **[Cache Components](https://preview.nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents)**: server caching with `'use cache'`, `cacheTag`, and `cacheLife`.
- **[Partial Prefetching](https://preview.nextjs.org/docs/app/guides/adopting-partial-prefetching)**: in-viewport links prefetch the shared App Shell by default.
- **[Runtime prefetching](https://preview.nextjs.org/docs/app/guides/runtime-prefetching)**: `prefetch = 'allow-runtime'` lets the prefetch include request data like `searchParams` and dynamic `params`.
- **[Hover-triggered prefetch](https://preview.nextjs.org/docs/app/guides/prefetching#hover-triggered-prefetch)**: `hoverPrefetch` defers a link's prefetch to hover or focus.
- **[Server Functions](https://nextjs.org/docs/app/getting-started/mutating-data)**: mutations invalidate only the tags they change with [`updateTag`](https://nextjs.org/docs/app/api-reference/functions/updateTag).
- **[React Compiler](https://react.dev/learn/react-compiler)**: automatic memoization.
- **[View Transitions](https://nextjs.org/docs/app/guides/view-transitions)**: animate content and route changes.
- **[Async React](https://github.com/rickhanlonii/async-react)**: keep the UI interactive during server work with `Suspense`, `useOptimistic`, `useTransition`, `useActionState`, `useFormStatus`, and `use`.
- **[`instant()`](https://preview.nextjs.org/docs/app/api-reference/file-conventions/route-segment-config/instant)** end-to-end tests with [`@next/playwright`](https://nextjs.org/docs/app/guides/testing/playwright), run in CI.

## Things to try

Prefetching only runs in production, so try these on the [live demo](https://next-beats.dev) or a local `pnpm build && pnpm start`. Open the Network tab to watch requests fire.

1. **Scroll the home page, then click a link.** It navigates instantly because the link was prefetched into the client cache as it entered the viewport, so no new request goes out on click.
2. **Favorite a track or create a playlist.** The Server Function calls `updateTag`, which revalidates the cached content for that tag and re-prefetches the affected routes, so navigating to them stays instant and reflects the change.
3. **Toggle Prefetch.** The App Shell is prefetched either way, so the click stays instant. With it on, the destination's content is prefetched too and ready on arrival. With it off, only the App Shell is prefetched and the content streams in after you navigate.
4. **Toggle Client.** Client components get outlined, and everything else is server-rendered and ships no JavaScript.
5. **Toggle Offline.** Routes you already prefetched still open instantly from the client cache. Turn the network back on and the dynamic data recovers.

## Getting started

NextBeats runs on Postgres. Set `DATABASE_URL` in `.env.local`, then:

```bash
pnpm install
pnpm run prisma.push
pnpm run prisma.seed
pnpm run dev
```

<details>
<summary>Run locally without Postgres</summary>

Drop this prompt into your agent to swap the datasource for SQLite:

> Set up NextBeats to run locally on SQLite instead of Postgres. Swap `provider = "postgresql"` to `provider = "sqlite"` in `prisma/schema.prisma`. Replace `@prisma/adapter-pg` with `@prisma/adapter-better-sqlite3` in `lib/db.ts` and `prisma/seed.ts`, using `new PrismaBetterSqlite3({ url })` where `url` is `process.env.DATABASE_URL` with the `file:` prefix stripped. Remove any `mode: 'insensitive'` Prisma filter options since SQLite doesn't support them. Install `@prisma/adapter-better-sqlite3` and `better-sqlite3`, uninstall `@prisma/adapter-pg`, `pg`, and `@types/pg`. Write `DATABASE_URL=file:./prisma/dev.db` to `.env.local`.

The schema is otherwise identical, so the rest of the app behaves the same as production.

</details>

## Stack

- **[Next.js 16.3](https://nextjs.org/)**: App Router, Cache Components, Server Functions
- **[React 19](https://react.dev/)** with React Compiler: Suspense, View Transitions, `useOptimistic`
- **[TypeScript](https://www.typescriptlang.org/)** and **[Tailwind CSS v4](https://tailwindcss.com/)**
- **[Prisma 7](https://www.prisma.io/)** on PostgreSQL
- **[Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)** for procedural per-genre synthesis

## License

[MIT](LICENSE)
