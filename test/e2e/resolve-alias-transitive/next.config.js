/** @type {import('next').NextConfig} */
module.exports = {
  turbopack: {
    resolveAlias: {
      'test-pkg/foo': 'test-pkg/foo/alt',
    },
  },
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      'test-pkg/foo': 'test-pkg/foo/alt',
    }
    return config
  },
}
