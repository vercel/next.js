/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    turbopackModuleFederation: {
      name: 'nextHost',
      remotes: {
        catalog: `catalog@${process.env.MF_REMOTE_ORIGIN}/browser/remoteEntry.js`,
        workerCatalog: `workerCatalog@${process.env.MF_REMOTE_ORIGIN}/worker/remoteEntry.js`,
      },
      shared: {
        'shared-value': {
          import: './shared-value.js',
          shareKey: 'shared-value',
          version: '1.2.0',
        },
      },
    },
  },
}

module.exports = nextConfig
