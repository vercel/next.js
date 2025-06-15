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
  webpack(config) {
    config.module.rules.push({
      test: /pages\/index.tsx$/,
      use: {
        loader: require.resolve('./test-file-loader.js'),
        options: { type: 'pages' },
      },
    })
    config.module.rules.push({
      test: /app\/app\/page.tsx$/,
      use: {
        loader: require.resolve('./test-file-loader.js'),
        options: { type: 'app-page' },
      },
    })
    config.module.rules.push({
      test: /app\/route\/route.tsx$/,
      use: {
        loader: require.resolve('./test-file-loader.js'),
        options: { type: 'app-route' },
      },
    })
    return config
  },
}

module.exports = nextConfig
