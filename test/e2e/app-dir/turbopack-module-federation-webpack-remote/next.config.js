/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    turbopackModuleFederation: {
      name: 'nextHost',
      remotes: {
        catalog: `catalog@${process.env.MF_REMOTE_URL}`,
        workerCatalog: `workerCatalog@/webpack-worker-remote/remoteEntry.js`,
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
  async rewrites() {
    return [
      {
        source: '/webpack-remote/:path*',
        destination: `${process.env.MF_REMOTE_ORIGIN}/browser/:path*`,
      },
      {
        source: '/webpack-worker-remote/:path*',
        destination: `${process.env.MF_REMOTE_ORIGIN}/worker/:path*`,
      },
    ]
  },
}

module.exports = nextConfig
