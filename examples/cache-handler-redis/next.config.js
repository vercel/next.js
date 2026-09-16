/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable Cache Components so the `'use cache: remote'` directive is available.
  cacheComponents: true,
  // The singular `cacheHandler` backs the ISR/incremental cache (pages, route
  // handlers, images).
  cacheHandler:
    process.env.NODE_ENV === "production"
      ? require.resolve("./cache-handler.js")
      : undefined,
  // The plural `cacheHandlers` back the `'use cache'` family. Here the `remote`
  // handler stores `'use cache: remote'` entries in the same Redis instance.
  cacheHandlers: {
    remote: require.resolve("./remote-cache-handler.js"),
  },
  // Disable the default in-memory cache so Redis is the single shared source
  // of truth across instances.
  cacheMaxMemorySize: 0,
  env: {
    NEXT_PUBLIC_REDIS_INSIGHT_URL:
      process.env.REDIS_INSIGHT_URL ?? "http://localhost:8001",
  },
};

module.exports = nextConfig;
