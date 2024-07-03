import { CacheHandler } from "@neshca/cache-handler";
import createLruHandler from "@neshca/cache-handler/local-lru";
import createRedisHandler from "@neshca/cache-handler/redis-stack";
import { createClient } from "redis";

/**
 * @see https://caching-tools.github.io/next-shared-cache/redis
 */
CacheHandler.onCreation(async () => {
  let client;
  try {
    client = createClient({
      url: process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
    });

    client.on("error", () => {});
  } catch (error) {
    console.warn("Failed to create Redis client:", error);
  }

  if (client) {
    try {
      console.info("Connecting Redis client...");

      await client.connect();
      console.info("Redis client connected.");
    } catch (error) {
      console.warn("Failed to connect Redis client:", error);

      console.warn("Disconnecting the Redis client...");
      client
        .disconnect()
        .then(() => {
          console.info("Redis client disconnected.");
        })
        .catch(() => {
          console.warn(
            "Failed to quit the Redis client after failing to connect.",
          );
        });
    }
  }

  /** @type {import("@neshca/cache-handler").Handler | null} */
  let handler;

  if (client?.isReady) {
    handler = await createRedisHandler({
      client,
      keyPrefix: "prefix:",
      timeoutMs: 1000,
    });
  } else {
    handler = createLruHandler();
    console.warn(
      "Falling back to LRU handler because Redis client is not available.",
    );
  }

  return {
    handlers: [handler],
  };
});

export default CacheHandler;
