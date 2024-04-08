/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    turbo: {
      rules: {
        '*.test-file.js': {
          browser: {
            foreign: {
              loaders: [
                {
                  loader: require.resolve('./test-file-loader.js'),
                  options: { browser: true, foreign: true },
                },
              ],
            },
            default: {
              loaders: [
                {
                  loader: require.resolve('./test-file-loader.js'),
                  options: { browser: true },
                },
              ],
            },
          },
          foreign: false,
          default: {
            loaders: [
              {
                loader: require.resolve('./test-file-loader.js'),
                options: { default: true },
              },
            ],
          },
        },
      },
    },
  },
}

module.exports = nextConfig
