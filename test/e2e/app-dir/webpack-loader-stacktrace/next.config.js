/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    turbo: {
      rules: {
        './pages/index.tsx': {
          loaders: [
            {
              loader: require.resolve('./test-file-loader.js'),
              options: { type: 'pages' },
            },
          ],
        },
        './app/app/page.tsx': {
          loaders: [
            {
              loader: require.resolve('./test-file-loader.js'),
              options: { type: 'app-page' },
            },
          ],
        },
        './app/route/route.tsx': {
          loaders: [
            {
              loader: require.resolve('./test-file-loader.js'),
              options: { type: 'app-route' },
            },
          ],
        },
      },
    },
  },
}

module.exports = nextConfig
