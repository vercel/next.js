import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    // Enable PPR for PPR-specific scenarios
    ppr: true,
  },

  // Custom cacheLife profiles for testing
  cacheLife: {
    // Built-in profiles are: default, seconds, minutes, hours, days, weeks, max
    // Add custom profiles for testing
    'custom-short': {
      stale: 5,
      revalidate: 10,
      expire: 60,
    },
    'custom-long': {
      stale: 3600,
      revalidate: 7200,
      expire: 86400,
    },
  },

  // Optional: Custom cache handler for multi-process testing
  // Uncomment to test with external cache
  // cacheHandler: require.resolve('./cache-handler.ts'),

  // Memory cache size (default: 50MB)
  // Set to 0 to disable in-memory cache for certain tests
  // cacheMaxMemorySize: 50 * 1024 * 1024,
}

export default nextConfig
