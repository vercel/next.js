/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  staticPageGenerationTimeout: 30,
  experimental: {
    staticGenerationRetryCount: 1,
    staticGenerationMaxConcurrency: 1,
  },
}

module.exports = nextConfig
