/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    // Reads `/* istanbul ignore next */` comments.
    swcPlugins: [['swc-plugin-coverage-instrument', {}]],
  },
}

module.exports = nextConfig
