const { createClient } = require("redis");
const { PHASE_PRODUCTION_BUILD } = require("next/constants");

// A custom `cacheHandlers.remote` handler backed by Redis. This is a different
// interface from the singular `cacheHandler` (in `cache-handler.js`): it backs
// the `'use cache: remote'` directive, its entries are streams, and it tracks
// tag revalidation by timestamp.
//
// See https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheHandlers

const ENTRY_PREFIX = "nextjs:use-cache:";
const TAG_PREFIX = "nextjs:use-cache-tag:";

const client = createClient({
  url: process.env.REDIS_URL ?? "redis://localhost:6379",
  // Fail commands immediately while the connection is down instead of queueing
  // them until Redis is back.
  disableOfflineQueue: true,
});

client.on("error", (error) => {
  if (process.env.NEXT_PRIVATE_DEBUG_CACHE) {
    console.warn("Redis client error (remote cache):", error);
  }
});

const connection =
  process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD
    ? Promise.resolve()
    : client.connect().catch((error) => {
        console.warn("Failed to connect to Redis (remote cache):", error);
      });

// `connect()` stays pending for as long as Redis is unreachable, so cap the
// wait: requests arriving during startup wait for the connection at most
// once, and while Redis is down every request is served uncached instead of
// blocking. The client keeps retrying in the background, so `isReady` flips
// back on its own once Redis is reachable again.
const CONNECT_TIMEOUT_MS = 1000;
const ready = Promise.race([
  connection,
  // `unref()` so this timer never keeps the process alive.
  new Promise((resolve) => setTimeout(resolve, CONNECT_TIMEOUT_MS).unref()),
]);

async function getClient() {
  await ready;
  return client.isReady ? client : null;
}

module.exports = {
  async get(cacheKey) {
    const redis = await getClient();
    if (!redis) return undefined;

    let stored;
    try {
      stored = await redis.get(ENTRY_PREFIX + cacheKey);
    } catch (error) {
      // A connection dropping mid-request degrades to a cache miss.
      if (process.env.NEXT_PRIVATE_DEBUG_CACHE) {
        console.warn("Redis get failed (remote cache):", error);
      }
      return undefined;
    }
    if (!stored) return undefined;

    const data = JSON.parse(stored);

    // Only `expire` means the entry is unusable. Past `revalidate` it's stale,
    // not expired: return it so Next.js can serve it while it refreshes in the
    // background. (`expire: Infinity` never trips this, which is intended.)
    if (Date.now() > data.timestamp + data.expire * 1000) {
      return undefined;
    }

    // Next.js only asks `getExpiration` about the route's soft tags, so the
    // entry's own tags (from `cacheTag`) are checked here. If any of them was
    // revalidated after this entry was created, on this instance or another,
    // the entry is out of date: report a miss so Next.js regenerates it.
    if (data.tags.length) {
      let revalidatedAt;
      try {
        revalidatedAt = await redis.mGet(
          data.tags.map((tag) => TAG_PREFIX + tag),
        );
      } catch (error) {
        // Without the tag timestamps we can't tell, so don't serve it.
        if (process.env.NEXT_PRIVATE_DEBUG_CACHE) {
          console.warn("Redis tag lookup failed (remote cache):", error);
        }
        return undefined;
      }

      if (
        revalidatedAt.some(
          (time) => time !== null && Number(time) > data.timestamp,
        )
      ) {
        return undefined;
      }
    }

    return {
      // `value` must be a stream; rebuild it from the stored bytes.
      value: new ReadableStream({
        start(controller) {
          controller.enqueue(Buffer.from(data.value, "base64"));
          controller.close();
        },
      }),
      tags: data.tags,
      stale: data.stale,
      timestamp: data.timestamp,
      expire: data.expire,
      revalidate: data.revalidate,
    };
  },

  async set(cacheKey, pendingEntry) {
    const redis = await getClient();
    if (!redis) return;

    // The entry may still be streaming, so await it, then drain the stream.
    const entry = await pendingEntry;

    const reader = entry.value.getReader();
    const chunks = [];
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }

    const bytes = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));

    // A TTL needs a positive integer. By definition, `expire: Infinity`
    // ("never expire") maps to no TTL at all, so omit it and let Redis persist
    // the key.
    const options = Number.isFinite(entry.expire)
      ? {
          expiration: {
            type: "EX",
            value: Math.max(1, Math.ceil(entry.expire)),
          },
        }
      : {};

    const value = JSON.stringify({
      value: bytes.toString("base64"),
      tags: entry.tags,
      stale: entry.stale,
      timestamp: entry.timestamp,
      expire: entry.expire,
      revalidate: entry.revalidate,
    });

    try {
      await redis.set(ENTRY_PREFIX + cacheKey, value, options);
    } catch (error) {
      if (process.env.NEXT_PRIVATE_DEBUG_CACHE) {
        console.warn("Redis set failed (remote cache):", error);
      }
    }
  },

  // Redis is the single source of truth and every read hits it, so there's no
  // local tag state to sync between requests.
  async refreshTags() {},

  // Return the most recent revalidation time across `tags`. Next.js calls
  // this after a hit with the route's soft tags (the implicit `_N_T_` tags
  // that `revalidatePath` uses) and discards the entry when the result is at
  // or after the entry's `timestamp`.
  async getExpiration(tags) {
    if (!tags.length) return 0;

    // If Redis can't answer, report the tags as revalidated just now: Next.js
    // then discards the entry and regenerates it, the same miss `get` falls
    // back to. Returning `0` would instead serve an entry that a
    // `revalidatePath` may already have invalidated.
    const redis = await getClient();
    if (!redis) return Date.now();

    let values;
    try {
      values = await redis.mGet(tags.map((tag) => TAG_PREFIX + tag));
    } catch (error) {
      if (process.env.NEXT_PRIVATE_DEBUG_CACHE) {
        console.warn("Redis tag lookup failed (remote cache):", error);
      }
      return Date.now();
    }

    const timestamps = values.filter(Boolean).map(Number);
    return timestamps.length ? Math.max(...timestamps) : 0;
  },

  // Record when each tag was last revalidated, for `get` (the entry's own
  // tags) and `getExpiration` (soft tags) to compare against. There's one key
  // per distinct tag, overwritten in place, so a small fixed tag set (like
  // this example's single `time-data` tag) never grows.
  //
  // An app that mints many distinct, short-lived tags (e.g. `user-<id>`) would
  // instead keep a key per tag forever. To bound that, give each key a TTL
  // (`{ expiration: { type: "EX", value } }`) at least as long as your longest
  // entry `expire`: the timestamp only needs to outlive entries created before
  // this revalidation, so a shorter TTL could drop it while such an entry is
  // still cached and serve it as fresh when it should be stale.
  async updateTags(tags) {
    const redis = await getClient();
    // Don't report success for a revalidation Redis never recorded: once Redis
    // is back, every instance would serve the old entries again.
    if (!redis) {
      throw new Error(
        "Redis is unavailable, so the tag revalidation was not recorded",
      );
    }

    const now = String(Date.now());
    await Promise.all(tags.map((tag) => redis.set(TAG_PREFIX + tag, now)));
  },
};
