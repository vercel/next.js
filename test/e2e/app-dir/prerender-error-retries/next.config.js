/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Retries are opt-in, but they should not apply to deterministic prerender
    // validation errors.
    staticGenerationRetryCount: 3,
    // Keep the build going after the first exhausted route so that the retry
    // behavior of every affected route is observable.
    prerenderEarlyExit: false,
  },
}

module.exports = nextConfig
