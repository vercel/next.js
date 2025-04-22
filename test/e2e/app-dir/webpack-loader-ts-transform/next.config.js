/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  turbopack: {
    rules: {
      '*.test-file.ts': [require.resolve('./test-file-loader.js')],
    },
  },
}

module.exports = nextConfig
