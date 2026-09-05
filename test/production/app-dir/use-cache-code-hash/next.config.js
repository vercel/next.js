/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    durableUseCacheEntries: true,
    durableUseCacheEntriesConfig: {
      unstableEnvVars: ['MY_DEPLOYMENT_ID'],
      ignoredEnvVars: ['MY_OIDC_TOKEN'],
    },
    runtimeServerDeploymentId: true,
  },
}

module.exports = nextConfig
