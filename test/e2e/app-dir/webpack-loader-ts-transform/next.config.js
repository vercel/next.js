/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    turbo: {
      rules: {
        '*.test-file.ts': [require.resolve('./test-file-loader.js')],
      },
    },
  },
}

module.exports = nextConfig
