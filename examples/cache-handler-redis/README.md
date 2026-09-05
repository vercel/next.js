# Next.js Redis Cache Integration Example

This example is tailored for self-hosted setups and demonstrates how to back Next.js caching with Redis, using no third-party adapter. It wires up **both** of Next.js's cache handler APIs against the [`redis`](https://github.com/redis/node-redis) client, storing everything in a single Redis instance:

- **[`cacheHandler`](https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheHandler) (singular)** — the ISR / incremental cache for pages, route handlers, and images. Implemented in [`cache-handler.js`](./cache-handler.js) with `get`, `set`, `revalidateTag`, and `resetRequestCache`.
- **[`cacheHandlers`](https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheHandlers) (plural)** — the [`'use cache'`](https://nextjs.org/docs/app/api-reference/directives/use-cache) family. The [`remote`](https://nextjs.org/docs/app/api-reference/directives/use-cache-remote) handler in [`remote-cache-handler.js`](./remote-cache-handler.js) stores `'use cache: remote'` entries with `get`, `set`, `refreshTags`, `getExpiration`, and `updateTags`.

Both are configured in [`next.config.js`](./next.config.js), which enables `cacheComponents: true` (required for `'use cache'`) and sets `cacheMaxMemorySize: 0` so Redis is the single shared source of truth across instances.

Check out this [repository](https://github.com/ezeparziale/nextjs-k8s) that contains a comprehensive setup for Kubernetes.

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example cache-handler-redis cache-handler-redis-app
```

```bash
yarn create next-app --example cache-handler-redis cache-handler-redis-app
```

```bash
pnpm create next-app --example cache-handler-redis cache-handler-redis-app
```

Once you have installed the dependencies, you can begin running the example Redis server by using the following command:

```bash
docker compose up -d
```

Then, build and start the Next.js app as usual. The custom cache handlers are only used for production builds (`next start`), so run:

```bash
npm run build
npm run start
```

To see the cache logs, set `NEXT_PRIVATE_DEBUG_CACHE=1` when starting the app.

## How it works

The `/[timezone]` page renders a mostly static shell and, inside it, a `'use cache: remote'` function (`getCurrentTime`) that fetches the current time. This exercises both handlers at once:

- **ISR cache (`cache-handler.js`):** stores the prerendered page entries as JSON under a `nextjs:cache:` prefix, and tracks which keys belong to each tag in a Redis set (`nextjs:tag:<tag>`). `revalidateTag` deletes every key associated with a tag.

- **Remote cache (`remote-cache-handler.js`):** stores each `'use cache: remote'` entry under a `nextjs:use-cache:` prefix (the streamed value is base64-encoded). Tag revalidation is timestamp-based: `updateTags` records `nextjs:use-cache-tag:<tag>` = now, and `getExpiration` reports the latest time so Next treats older entries as stale. Clicking **Revalidate** calls [`updateTag('time-data')`](https://nextjs.org/docs/app/api-reference/functions/updateTag), which regenerates the remote entry.

- **Building without Redis:** both handlers skip connecting during `next build` (they check `NEXT_PHASE`) and degrade gracefully when Redis is unavailable, so the app still builds and runs, just without a shared cache.

- **Redis server setup:** ensure your Redis server is running before starting the app. Configure the connection with `REDIS_URL` (defaults to `redis://localhost:6379`).

> **Note:** This example fetches the current time from a public API (`timeapi.io`) purely as sample data to demonstrate caching and revalidation. It is included for learning purposes only. If you reuse it, review and respect that API's terms of use and rate limits, and swap in your own data source for real applications.

## Revalidation: paths, soft tags, and advisory parameters

The **Revalidate** button ([`revalidate-from.tsx`](./app/revalidate-from.tsx)) calls [`updateTag('time-data')`](https://nextjs.org/docs/app/api-reference/functions/updateTag), but that is only one entry point into the remote handler's tag machinery. Two related capabilities are handled without extra code, and two handler parameters are intentionally unused:

- **[`revalidatePath`](https://nextjs.org/docs/app/api-reference/functions/revalidatePath) works without extra code.** Next.js derives implicit _soft tags_ from the route path (prefixed `_N_T_`, e.g. `_N_T_/[timezone]`) and routes path revalidation through the same tags as `revalidateTag`. A `revalidatePath('/…')` call therefore reaches `updateTags(['_N_T_/…'])`, and the next read calls `getExpiration(['_N_T_/…'])`. Because both methods operate generically over any tag string, path revalidation propagates across instances through Redis exactly like an explicit tag.

- **`get(cacheKey, softTags)` ignores `softTags` by design.** A handler can honor soft tags one of two ways: implement `getExpiration` to return the most recent revalidation timestamp (Next.js then performs the soft-tag staleness check itself), or return `Infinity` from `getExpiration` and compare timestamps inside `get`. This handler does the former, so it never needs to read the `softTags` argument.

- **`updateTags(tags, durations)` ignores `durations` by design.** `durations` (`{ expire }`) is only populated when a revalidation call carries a [`cacheLife`](https://nextjs.org/docs/app/api-reference/functions/cacheLife) profile, such as `revalidateTag(tag, 'max')`; it defers a tag's expiration into the future instead of expiring it immediately. This example performs only immediate revalidation, so `durations` is always `undefined` — equivalent to recording the current timestamp, which is what `updateTags` already does.

See the [Soft Tags](https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheHandlers#soft-tags) section of the `cacheHandlers` documentation for the full tag architecture.

## Documentation

For detailed information, see the official Next.js documentation:

- [`cacheHandler` (ISR / incremental cache) ↗](https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheHandler)
- [`cacheHandlers` (`'use cache'`) ↗](https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheHandlers)
- [`'use cache: remote'` ↗](https://nextjs.org/docs/app/api-reference/directives/use-cache-remote)
- [Self-hosting: configuring caching ↗](https://nextjs.org/docs/app/guides/self-hosting#configuring-caching)

## Development and Production Considerations

- The provided `compose.yaml` is intended for local development. For production deployment, refer to the official [Redis installation](https://redis.io/docs/install/) and [management](https://redis.io/docs/management/) guidelines.

- **Inspecting the cache:** The `redis-stack` image bundles RedisInsight on port `8001`. Open it in your browser (linked from the example UI) to watch both the `nextjs:cache:` (ISR) and `nextjs:use-cache:` (remote) keys appear and expire.

- **Clearing Redis Cache:** To clear the Redis cache, use RedisInsight Workbench or the following CLI command:

  ```bash
  docker exec -it cache-handler-redis redis-cli
  127.0.0.1:6379> flushall
  OK
  ```
