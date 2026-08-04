# Next.js Redis Cache Integration Example (Turbo Redis Cache)

This example demonstrates a self-hosted Next.js setup using Redis as a shared
cache with [`@trieb.work/nextjs-turbo-redis-cache`](https://www.npmjs.com/package/@trieb.work/nextjs-turbo-redis-cache).

It covers **both** Next.js cache handler interfaces side by side:

| Interface | Used by | Handler file |
| --- | --- | --- |
| `cacheHandler` (singular) | Pages Router ISR, on-demand revalidation | `cache-handler.js` |
| `cacheHandlers` (plural) | `'use cache'` directive, `cacheComponents: true` (Next.js 16+) | `cache-components-handler.js` |

The existing [`cache-handler-redis`](../cache-handler-redis) example uses
`@neshca/cache-handler`, which does not support Next.js 16 Cache Components
(`peerDependencies.next: ">= 13.5.1 < 15"`). This example fills that gap.

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example cache-handler-redis-turbo cache-handler-redis-turbo-app
```

```bash
yarn create next-app --example cache-handler-redis-turbo cache-handler-redis-turbo-app
```

```bash
pnpm create next-app --example cache-handler-redis-turbo cache-handler-redis-turbo-app
```

### 1. Start Redis

```bash
docker compose up -d
```

This starts a `redis/redis-stack` container on port `6379` with RedisInsight on
port `8001`.

### 2. Enable Redis key-space notifications

The handler uses Redis key-space notifications to keep its in-memory tag map in
sync across instances. Enable them with:

```bash
redis-cli -h localhost config set notify-keyspace-events Exe
```

> If your Redis provider forbids `CONFIG` commands (e.g. some managed Redis
> services), set `SKIP_KEYSPACE_CONFIG_CHECK=true` to skip the check.

### 3. Build and start the Next.js app

```bash
npm run build
npm start
```

> `next build` does **not** require a running Redis instance — both handlers
> no-op during `PHASE_PRODUCTION_BUILD`. Redis is only needed at runtime.

### 4. View the cache

Open [http://localhost:3000](http://localhost:3000) and navigate to:

- **`/cet`** or **`/gmt`** — Time demo using `'use cache'` with
  `cacheLife("minutes")` and `cacheTag("time-data")`. Shows the current time,
  a cache-state watcher, and a "Revalidate" button that calls
  `revalidateTag("time-data", "max")`.
- **`/use-cache`** — Cache Components demo (plural `cacheHandlers`). Uses the
  `'use cache'` directive with `cacheLife("minutes")` and `cacheTag(...)`.
  The "Revalidate" button calls `revalidateTag("use-cache-fact", "max")`, which
  invalidates the cached entry across all server instances sharing the Redis
  cache.

To see cache debug logs:

```bash
DEBUG_CACHE_HANDLER=true npm start
```

## Documentation

- [Package README](https://github.com/trieb-work/nextjs-turbo-redis-cache#readme)
- [Architecture deep dive](https://github.com/trieb-work/nextjs-turbo-redis-cache/blob/main/ARCHITECTURE.md)
- [TRWK Case Study](https://trwk.de/case-studies/nextjs-turbo-redis-cache)

## Key Features

- **L1 + L2 caching**: in-memory L1 cache per instance + Redis L2 as the shared
  source of truth across all instances.
- **Request deduplication**: concurrent `get` calls for the same key are
  deduplicated to avoid redundant Redis round-trips.
- **Batch tag invalidation**: `revalidateTag` operations are grouped and
  optimized for minimal Redis stress.
- **Key-space notifications**: the in-memory tag map is automatically updated
  when Redis keys expire or are evicted.
- **Cache Components support**: full support for the `'use cache'` directive,
  `cacheTag`, and `cacheLife` (Next.js 16+).
- **Pages Router support**: ISR pages, `notFound`/`redirect` results, and
  on-demand `res.revalidate(path)` — including across multiple instances.

## Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `REDIS_URL` | Recommended | Redis connection URL, e.g. `redis://localhost:6379` |
| `REDISHOST` | If no `REDIS_URL` | Redis host (with `REDISPORT`) |
| `REDISPORT` | If no `REDIS_URL` | Redis port |
| `VERCEL_URL` | Optional | Used as a key prefix for multi-tenant / deploy isolation |
| `VERCEL_ENV` | Optional | `production` → Redis DB 0; anything else → DB 1 |
| `KEY_PREFIX` | Optional | Explicit cache key prefix |
| `DEBUG_CACHE_HANDLER` | Optional | Set to `true` for debug logging |
| `SKIP_KEYSPACE_CONFIG_CHECK` | Optional | Set to `true` to skip the `notify-keyspace-events` check |
| `KILL_CONTAINER_ON_ERROR_THRESHOLD` | Optional | Exit after N Redis errors (for container restarts) |
| `REDIS_COMMAND_TIMEOUT_MS` | Optional | Timeout for Redis GET (default: 500ms) |

## Development and Production Considerations

- The provided `compose.yaml` is intended for local development. For production
  deployment, refer to the official
  [Redis installation](https://redis.io/docs/install/) and
  [management](https://redis.io/docs/management/) guidelines.
- **Clearing Redis Cache:**

  ```bash
  docker exec -it cache-handler-redis-turbo redis-cli
  127.0.0.1:6379> flushall
  OK
  ```
