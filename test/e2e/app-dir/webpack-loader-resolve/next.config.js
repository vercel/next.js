/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  turbopack: {
    rules: {
      '*.test-file.ts': [require.resolve('./test-file-loader.js')],
      '*.no-options.ts': [
        require.resolve('./get-resolve-no-options-loader.js'),
      ],
    },
  },
  webpack(config) {
    config.module.rules.push({
      test: /\.test-file\.ts/,
      use: require.resolve('./test-file-loader.js'),
    })
    config.module.rules.push({
      test: /\.no-options\.ts/,
      use: require.resolve('./get-resolve-no-options-loader.js'),
    })
    return config
  },
}

module.exports = nextConfig
