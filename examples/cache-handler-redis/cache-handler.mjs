import { IncrementalCache } from "@neshca/cache-handler";
import createRedisHandler from "@neshca/cache-handler/redis-stack";
import createLruHandler from "@neshca/cache-handler/local-lru";
import { createClient } from "redis";

IncrementalCache.onCreation(async () => {
  // create Redis client inside a callback
  const client = createClient({
    url: process.env.REDIS_URL ?? "redis://localhost:6379",
  });

  /**
   * redis package tells us:
   * You must listen to error events.
   * If a client doesn't have at least one error listener registered and an error occurs,
   * that error will be thrown and the Node.js process will exit.
   *
   * https://github.com/redis/node-redis?tab=readme-ov-file#events
   *
   * Client will reconnect automatically if any errors occurs.
   */
  client.on("error", () => {});

  // read more about TTL limitations https://caching-tools.github.io/next-shared-cache/configuration/ttl
  function useTtl(maxAge) {
    const evictionAge = maxAge * 1.5;

    return evictionAge;
  }

  await client.connect();

  const redisHandler = await createRedisHandler({
    client,
    useTtl,
  });

  const localHandler = createLruHandler({
    useTtl,
  });

  return {
    cache: [redisHandler, localHandler],
    // read more about useFileSystem limitations https://caching-tools.github.io/next-shared-cache/configuration/use-file-system
    useFileSystem: false,
  };
});

export default IncrementalCache;
