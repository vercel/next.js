<div align="center">

<img src="public/logo.svg" alt="NextBeats" width="72" height="72" />

# NextBeats

A [Next.js 16.3](https://nextjs.org/blog/next-16-3-instant-navigations) music player demonstrating [Instant Navigations](https://preview.nextjs.org/docs/app/guides/instant-navigation).

[**Live demo →**](https://next-beats.dev)

</div>

---

> **This is a benchmark fixture.** A copy of NextBeats vendored into `bench/` as a
> realistic render-pipeline target, adapted to build and run offline. For setup,
> how to build and serve it, and what was changed from the original demo, see
> [BENCH_NOTES.md](./BENCH_NOTES.md). The rest of this README describes the app itself.

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

This vendored copy runs offline on a deterministically seeded in-memory store, so
no database or external service is needed. See
[BENCH_NOTES.md](./BENCH_NOTES.md) for the build and serve steps. The
[live demo](https://next-beats.dev) runs the original Postgres-backed version.

## Stack

- **[Next.js 16.3](https://nextjs.org/)**: App Router, Cache Components, Server Functions
- **[React 19](https://react.dev/)** with React Compiler: Suspense, View Transitions, `useOptimistic`
- **[TypeScript](https://www.typescriptlang.org/)** and **[Tailwind CSS v4](https://tailwindcss.com/)**
- **In-memory store** seeded deterministically from `lib/seed-data.ts` (no external database)
- **[Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)** for procedural per-genre synthesis

## License

[MIT](LICENSE)
