/** @type {import('next').NextConfig} */
const nextConfig = {
  cacheHandler:
    process.env.NODE_ENV === "production"
      ? require.resolve("./cache-handler.js")
      : undefined,
  // Disable the default in-memory cache so Redis is the single shared source
  // of truth across instances.
  cacheMaxMemorySize: 0,
  env: {
    NEXT_PUBLIC_REDIS_INSIGHT_URL:
      process.env.REDIS_INSIGHT_URL ?? "http://localhost:8001",
  },
};

module.exports = nextConfig;
