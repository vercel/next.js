/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    // Global cacheKeyExcludedHeaders: x-request-id should be ignored when
    // computing the fetch Data Cache key so requests with different values
    // still hit the same cached response.
    cacheKeyExcludedHeaders: ['x-request-id'],
  },
}

module.exports = nextConfig
