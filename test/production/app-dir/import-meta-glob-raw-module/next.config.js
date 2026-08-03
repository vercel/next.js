/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  turbopack: {
    rules: {
      // `raw` includes the file as an opaque module without exports.
      '*.md': { type: 'raw' },
    },
  },
}

module.exports = nextConfig
