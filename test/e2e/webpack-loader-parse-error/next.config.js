/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  turbopack: {
    rules: {
      '*.broken.js': {
        loaders: [
          {
            loader: require.resolve('./broken-js-loader.js'),
          },
        ],
      },
      '*.broken.css': {
        loaders: [
          {
            loader: require.resolve('./broken-css-loader.js'),
          },
        ],
      },
    },
  },
  webpack: (config) => {
    config.module.rules.push(
      {
        test: /\.broken\.js$/,
        use: [require.resolve('./broken-js-loader.js')],
      },
      {
        test: /\.broken\.css$/,
        use: [require.resolve('./broken-css-loader.js')],
      }
    )
    return config
  },
}

module.exports = nextConfig
