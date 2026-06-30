# Next.js Redis Cache Integration Example

This example is tailored for self-hosted setups and demonstrates how to use Redis as a shared cache. It implements a custom Next.js [`cacheHandler`](https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheHandler) directly against the [`redis`](https://github.com/redis/node-redis) client, so no third-party adapter is required.

The handler lives in [`cache-handler.js`](./cache-handler.js) and implements the `get`, `set`, `revalidateTag`, and `resetRequestCache` methods. It's wired up in [`next.config.js`](./next.config.js), which also sets `cacheMaxMemorySize: 0` to disable the default in-memory cache so Redis is the single shared source of truth across instances.

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

Then, build and start the Next.js app as usual. The custom cache handler is only used for production builds (`next start`), so run:

```bash
npm run build
npm run start
```

To see the cache logs, set `NEXT_PRIVATE_DEBUG_CACHE=1` when starting the app.

## How it works

- **The cache handler:** [`cache-handler.js`](./cache-handler.js) connects to Redis, stores each cache entry as JSON under a `nextjs:cache:` prefix, and tracks which keys belong to each tag in a Redis set (`nextjs:tag:<tag>`). `revalidateTag` then deletes every key associated with a tag.

- **Building without Redis:** The handler skips connecting to Redis during `next build` (it checks `NEXT_PHASE`) and falls back gracefully (returning `null` / no-op) when Redis is unavailable, so the app still builds and runs, just without a shared cache.

- **Redis server setup:** Ensure your Redis server is running and properly configured before starting your Next.js application. Configure the connection by setting `REDIS_URL` (defaults to `redis://localhost:6379`).

> **Note:** This example fetches the current time from a public API (`timeapi.io`) purely as sample data to demonstrate caching and revalidation. It is included for learning purposes only. If you reuse it, review and respect that API's terms of use and rate limits, and swap in your own data source for real applications.

## Documentation

For detailed information on configuring a custom cache handler, see the official Next.js documentation:

- [`cacheHandler` configuration ↗](https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheHandler)
- [Self-hosting: configuring caching ↗](https://nextjs.org/docs/app/guides/self-hosting#configuring-caching)

## Development and Production Considerations

- This example covers the server cache (`cacheHandler`) used for ISR, route handler responses, and optimized images. If you're configuring backends for the `'use cache'` directive instead, see [`cacheHandlers`](https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheHandlers) (plural).

- The provided `compose.yaml` is intended for local development. For production deployment, refer to the official [Redis installation](https://redis.io/docs/install/) and [management](https://redis.io/docs/management/) guidelines.

- **Inspecting the cache:** The `redis-stack` image bundles RedisInsight on port `8001`. Open it in your browser (linked from the example UI) to watch cache keys appear and expire.

- **Clearing Redis Cache:** To clear the Redis cache, use RedisInsight Workbench or the following CLI command:

  ```bash
  docker exec -it cache-handler-redis redis-cli
  127.0.0.1:6379> flushall
  OK
  ```
