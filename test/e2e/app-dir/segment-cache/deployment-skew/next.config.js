const BUILD_ID = process.env.BUILD_ID
if (!BUILD_ID) {
  throw new Error('BUILD_ID is not set')
}

/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    clientSegmentCache: true,
  },

  distDir: '.next.' + BUILD_ID,

  async generateBuildId() {
    return BUILD_ID
  },
}

module.exports = nextConfig
