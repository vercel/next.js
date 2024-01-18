const {
  reviveFromBase64Representation,
  replaceJsonWithBase64,
} = require("@neshca/json-replacer-reviver");
const { IncrementalCache } = require("@neshca/cache-handler");
const createLruCache = require("@neshca/cache-handler/local-lru").default;
const { createClient } = require("redis");

const REVALIDATED_TAGS_KEY = "sharedRevalidatedTags";

const client = createClient({
  url: process.env.REDIS_URL ?? "redis://localhost:6379",
});

client.on("error", (error) => {
  console.error("Redis error:", error.message);
});

IncrementalCache.onCreation(async () => {
  // read more about TTL limitations https://caching-tools.github.io/next-shared-cache/configuration/ttl
  const useTtl = false;

  await client.connect();

  const redisCache = {
    async get(key) {
      try {
        const result = (await client.get(key)) ?? null;

        if (!result) {
          return null;
        }

        // use reviveFromBase64Representation to restore binary data from Base64
        return JSON.parse(result, reviveFromBase64Representation);
      } catch (error) {
        console.error("cache.get", error);

        return null;
      }
    },
    async set(key, value, ttl) {
      try {
        await client.set(
          key,
          // use replaceJsonWithBase64 to store binary data in Base64 and save space
          JSON.stringify(value, replaceJsonWithBase64),
          useTtl && typeof ttl === "number" ? { EX: ttl } : undefined,
        );
      } catch (error) {
        console.error("cache.set", error);
      }
    },
    async getRevalidatedTags() {
      try {
        const sharedRevalidatedTags = await client.hGetAll(
          REVALIDATED_TAGS_KEY,
        );

        const entries = Object.entries(sharedRevalidatedTags);

        const revalidatedTags = Object.fromEntries(
          entries.map(([tag, revalidatedAt]) => [tag, Number(revalidatedAt)]),
        );

        return revalidatedTags;
      } catch (error) {
        console.error("cache.getRevalidatedTags", error);
      }
    },
    async revalidateTag(tag, revalidatedAt) {
      try {
        await client.hSet(REVALIDATED_TAGS_KEY, {
          [tag]: revalidatedAt,
        });
      } catch (error) {
        console.error("cache.revalidateTag", error);
      }
    },
  };

  const localCache = createLruCache({
    useTtl,
  });

  return {
    cache: [redisCache, localCache],
    useFileSystem: !useTtl,
  };
});

module.exports = IncrementalCache;
