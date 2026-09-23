/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    turbopackModuleFederation: {
      implementation:
        process.env.MF_IMPLEMENTATION === 'resolved'
          ? require.resolve('@module-federation/runtime-tools')
          : process.env.MF_IMPLEMENTATION || undefined,
      name: 'nextHost',
      remotes: {
        catalog: `catalog@${process.env.MF_REMOTE_ORIGIN}/browser/remoteEntry.js`,
        workerCatalog: `workerCatalog@${process.env.MF_REMOTE_ORIGIN}/worker/remoteEntry.js`,
        fallbackCatalog: [
          `unavailableCatalog@${process.env.MF_REMOTE_ORIGIN}/fallback.js`,
          `catalog@${process.env.MF_REMOTE_ORIGIN}/browser/remoteEntry.js`,
        ],
      },
      shared: {
        'shared-value': {
          import: './shared-value.js',
          shareKey: 'shared-value',
          version: '1.2.0',
        },
        'shared-value-older': {
          import: './shared-value.js',
          shareKey: 'shared-value',
          version: '1.0.0',
        },
      },
    },
  },
}

module.exports = nextConfig
