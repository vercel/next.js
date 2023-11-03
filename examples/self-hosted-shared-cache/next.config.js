/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    incrementalCacheHandlerPath: require.resolve(
      // './cache-handler-redis.js' // if you're using Redis without JSON support
      './cache-handler-redis-stack.js'
    ),
  },
  env: {
    NEXT_PUBLIC_REDIS_INSIGHT_URL:
      process.env.REDIS_INSIGHT_URL ?? 'http://localhost:8001',
  },
}

module.exports = nextConfig
