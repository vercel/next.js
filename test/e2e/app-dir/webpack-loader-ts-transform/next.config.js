/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  turbopack: {
    rules: {
      '*.test-file.ts': [require.resolve('./test-file-loader.js')],
    },
  },
  webpack(config) {
    config.module.rules.push({
      test: /\.test-file\.ts/,
      use: require.resolve('./test-file-loader.js'),
    })
    return config
  },
}

module.exports = nextConfig
