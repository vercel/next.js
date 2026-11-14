/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  supportsImmutableAssets: true,
  experimental: {
    useCacheStaticRootParamTracking: true,
    durableUseCacheEntries: true,
    durableUseCacheEntriesConfig: {
      unstableEnvVars: ['MY_DEPLOYMENT_ID'],
      ignoredEnvVars: ['MY_OIDC_TOKEN'],
    },
    runtimeServerDeploymentId: true,
  },
}

module.exports = nextConfig
