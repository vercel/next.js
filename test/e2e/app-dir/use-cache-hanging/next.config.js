/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    // Lower the `'use cache'` fill timeout so tests don't race the browser's
    // page.goto ceiling (default ~60s) after the 54s default + compile time.
    useCacheTimeout: 10,
  },
}

module.exports = nextConfig
