/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  // Enabled in the config rather than left to the test matrix, because the
  // route this fixture exists for selects a `cacheLife` per variant, and `'use
  // cache'` does not compile without it.
  cacheComponents: true,
  experimental: {
    variants: true,
  },
}

module.exports = nextConfig
