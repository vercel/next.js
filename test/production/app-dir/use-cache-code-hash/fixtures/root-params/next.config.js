/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  supportsImmutableAssets: true,
  experimental: {
    useCacheStaticRootParamTracking: true,
    durableUseCacheEntries: true,
    runtimeServerDeploymentId: true,
  },
}

module.exports = nextConfig
