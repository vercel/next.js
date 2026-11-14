import type { NextConfig } from "next";

// Opt in to a shared Redis cache at build time with
// `docker build --build-arg CACHE_HANDLER=redis`. Docker Compose does this for
// you. Without it, Next.js keeps its default per-container cache.
// See https://nextjs.org/docs/app/guides/self-hosting#configuring-caching
const useRedisCache = process.env.CACHE_HANDLER === "redis";

const nextConfig: NextConfig = {
  output: "standalone",
  ...(useRedisCache && {
    // Store ISR, route handler, and `fetch` cache entries in Redis so every
    // container shares one cache. `'use cache'` directives use the separate
    // `cacheHandlers` option instead.
    cacheHandler: require.resolve("./cache-handler.js"),
    // Disable the default in-memory cache so Redis is the single source of
    // truth across containers.
    cacheMaxMemorySize: 0,
  }),
};

export default nextConfig;
