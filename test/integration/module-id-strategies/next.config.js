module.exports = {
  bundlePagesRouterDependencies: true,
  serverExternalPackages: ['opted-out-external-package'],
  experimental: {
    turbo: {
      moduleIdStrategy:
        process.env.NODE_ENV === 'production' ? 'deterministic' : undefined,
    },
  },
}
