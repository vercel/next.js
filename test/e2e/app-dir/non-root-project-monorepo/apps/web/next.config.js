// The deploy harness adds these aliases to the root config, but this app loads
// its own config under apps/web.
if (process.env.NEXT_PRIVATE_EXPERIMENTAL_CACHE_COMPONENTS) {
  process.env.__NEXT_CACHE_COMPONENTS =
    process.env.NEXT_PRIVATE_EXPERIMENTAL_CACHE_COMPONENTS
}
if (process.env.NEXT_PRIVATE_EXPERIMENTAL_CACHED_NAVIGATIONS) {
  process.env.__NEXT_EXPERIMENTAL_CACHED_NAVIGATIONS =
    process.env.NEXT_PRIVATE_EXPERIMENTAL_CACHED_NAVIGATIONS
}

/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    instantInsights: {
      validationLevel: 'manual-warning',
    },
  },
}

module.exports = nextConfig
