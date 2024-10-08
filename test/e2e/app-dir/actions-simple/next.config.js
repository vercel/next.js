/**
 * @type {import('next').NextConfig}
 */

const nextConfig = {
  webpack(config) {
    config.resolve.alias['next/dist/client/app-find-source-map-url'] =
      require.resolve('./find-source-map-url-webpack-mock.ts')

    return config
  },
  experimental: {
    turbo: {
      resolveAlias: {
        'next/dist/client/app-find-source-map-url':
          './find-source-map-url-turbopack-mock.ts',
      },
    },
  },
}

module.exports = nextConfig
