/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    // Ensure the second short-lived prerender hits the handler rather than
    // joining an in-flight cache generation from the first prerender.
    staticGenerationMaxConcurrency: 1,
  },
  cacheHandlers: {
    default: require.resolve('./handler-loader.mjs'),
    'route-aware': require.resolve('./route-aware-handler.js'),
  },
}

module.exports = nextConfig
