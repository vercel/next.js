# Next.js Redis Cache Integration Example

This repository provides a production-ready example of how to enhance the caching capabilities of Next.js and use Redis to share the cache for multiple instances of your app. It's made possible by the [`@neshca/cache-handler`](https://github.com/caching-tools/next-shared-cache/tree/canary/packages/cache-handler) package, which replaces the default Next.js cache handler while preserving the original functionality of reading pre-rendered pages from the file system.

This particular example is designed to be self-hosted.

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

Once you have installed the dependencies, you can begin running the example Redis Stack server by using the following command:

```bash
docker-compose up -d
```

Then, build and start the Next.js app as usual.

## Notes

- **Handlers:** The `@neshca/cache-handler` package now includes new [Handlers](https://caching-tools.github.io/next-shared-cache/redis-stack) for Redis, making it almost zero-config.

- **Think different:** Ensure that your Redis server is operational and accessible before starting your Next.js application to prevent any connection errors. Remember to flush the cache or use namespacing if you preserve the Redis instance between builds.

- **Configure:** Add your Redis credentials to the provided `cache-handler-redis*` files. Learn more about connecting to Redis with Node.js [here](https://redis.io/docs/connect/clients/nodejs/).

- **Opt out of Redis during build if needed:**
  To build your Next.js app without connecting to Redis, wrap the `onCreation` callback with a condition as shown below:

  ```js
  if (process.env.SERVER_STARTED) {
    IncrementalCache.onCreation(() => {
      // Your code here
    })
  }
  ```

  This condition helps avoid potential issues if your Redis server is deployed concurrently with the app build.

- **Opt out file system reads, writes or both:**
  By default, the `@neshca/cache-handler` uses the file system to preserve the original behavior of Next.js, for instance, reading pre-rendered pages from the Pages dir. To opt out of this functionality, add the `diskAccessMode` option:

  ```js
  IncrementalCache.onCreation(() => {
    return {
      diskAccessMode: 'read-no/write-no', // Default is 'read-yes/write-yes'
      cache: {
        // The same cache configuration as in the example
      },
    }
  })
  ```

  This may be useful if you use only App dir and don't mind if Redis instance fails.

Provided `docker-compose.yml` is for local development only. It is not suitable for production use. Read more about [Redis installation](https://redis.io/docs/install/) and [management](https://redis.io/docs/management/) before deploying your application to production.

### How to clear the Redis cache

If you need to clear the Redis cache, use RedisInsight Workbench or run the following command:

```bash
docker exec -it redis-stack redis-cli
127.0.0.1:6379> flushall
OK
```
