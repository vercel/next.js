/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    turbo: {
      rules: {
        '*.test-file.js': {
          browser: {
            loaders: [
              {
                loader: require.resolve('./test-file-loader.js'),
                options: { browser: true },
              },
            ],
          },
          'next-app': {
            'next-ssr': {
              loaders: [
                {
                  loader: require.resolve('./test-file-loader.js'),
                  options: { nextSsr: true },
                },
              ],
            },
          },
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
