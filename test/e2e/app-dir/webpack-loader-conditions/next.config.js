/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  turbopack: {
    rules: {
      '*.test-file.js': [
        {
          condition: { all: ['browser', 'foreign'] },
          loaders: [
            {
              loader: require.resolve('./test-file-loader.js'),
              options: { browser: true, foreign: true },
            },
          ],
        },
        {
          condition: { all: ['browser', { not: 'foreign' }] },
          loaders: [
            {
              loader: require.resolve('./test-file-loader.js'),
              options: { browser: true },
            },
          ],
        },
        {
          condition: { not: { any: ['browser', 'foreign'] } },
          loaders: [
            {
              loader: require.resolve('./test-file-loader.js'),
              options: { default: true },
            },
          ],
        },
      ],
    },
  },
}

module.exports = nextConfig
