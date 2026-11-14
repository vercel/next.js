/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  turbopack: {
    rules: {
      '*.wasm': {
        loaders: [
          {
            loader: 'file-loader',
            options: {
              esModule: true,
            },
          },
        ],
        as: '*.js',
      },
    },
  },

  webpack(config) {
    config.module.rules.push({
      test: /\.wasm/,
      loader: 'file-loader',
      options: {},
    })

    return config
  },
}

module.exports = nextConfig
