# Next.js Redis Cache Integration Example

This example is tailored for self-hosted setups and demonstrates how to use Redis as a shared cache. It is built on the principles of the `@neshca/cache-handler` package, which replaces the default Next.js cache handler and adds advanced caching features.

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

Once you have installed the dependencies, you can begin running the example Redis Stack server by using the following command:

```bash
docker-compose up -d
```

Then, build and start the Next.js app as usual.

## Documentation

For detailed information on configuration and usage, please refer to our comprehensive [Documentation ↗](https://caching-tools.github.io/next-shared-cache).

## Key Features and Considerations

- **Handlers:** The `@neshca/cache-handler` package includes [Handlers](https://caching-tools.github.io/next-shared-cache/redis-stack) for seamless integration with Redis.

- **Create Your Own Handlers:** Take a look at [Custom Redis Handler](https://caching-tools.github.io/next-shared-cache/redis-stack-custom) and use it as a basis to create your own handler.

- **Redis Server Setup:** Ensure your Redis server is running and properly configured before starting your Next.js application.

- **Configure Redis Credentials:** Update the `cache-handler-redis*` files with your Redis credentials. Connection details can be found [here](https://redis.io/docs/connect/clients/nodejs/).

- **Building Without Redis:** To build the app without connecting to Redis use conditions inside `onCreation` callback. Check the [documentation](https://caching-tools.github.io/next-shared-cache/configuration/opt-out-cache-on-build) for more details.

## Development and Production Considerations

- The provided `docker-compose.yml` is intended for local development. For production deployment, refer to the official [Redis installation](https://redis.io/docs/install/) and [management](https://redis.io/docs/management/) guidelines.

- **Clearing Redis Cache:** To clear the Redis cache, use RedisInsight Workbench or the following CLI command:

  ```bash
  docker exec -it redis-stack redis-cli
  127.0.0.1:6379> flushall
  OK
  ```
