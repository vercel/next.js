# Example of the self-hosted app with Redis as cache storage

This example demonstrates using Redis as a shared cache for hosting multiple instances of a Next.js app. It supports caching at both the App and Pages routes in default and standalone modes, as well as Partial Pre-rendering. This functionality is made possible by the [`@neshca/cache-handler`](https://github.com/caching-tools/next-shared-cache/tree/canary/packages/cache-handler) package, which offers an API to customize cache handlers and seamlessly replace Next.js' default cache.

This particular example is designed to be self-hosted.

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example self-hosted-shared-cache self-hosted-shared-cache-app
```

```bash
yarn create next-app --example self-hosted-shared-cache self-hosted-shared-cache-app
```

```bash
pnpm create next-app --example self-hosted-shared-cache self-hosted-shared-cache-app
```

Specify the Redis connection string using the `REDIS_URL` environment variable. This can be a URL or a connection string formatted as `redis[s]://[[username][:password]@][host][:port][/db-number]`. Learn more about connecting to Redis with Node.js [here](https://redis.io/docs/connect/clients/nodejs/).

Once you have installed the dependencies, you can begin running the example Redis Stack server by using the following command:

```bash
docker-compose up -d
```

Then, build and start the Next.js app as usual.

## Notes

Provided `docker-compose.yml` is for local development only. It is not suitable for production use. Read more about [Redis installation](https://redis.io/docs/install/) and [maganement](https://redis.io/docs/management/) before deploying your application to production.

### Cache of your application lives outside of the Next.js app

If you need to clear the Redis cache, use RedisInsight Workbench or run the command below:

```bash
docker exec -it redis-stack redis-cli
127.0.0.1:6379> flushall
OK
```
