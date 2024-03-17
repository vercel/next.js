/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    turbo: {
      rules: {
        './pages/index.tsx': {
          loaders: [require.resolve('./test-file-loader.js')],
        },
      },
    },
  },
}

module.exports = nextConfig
