const BUILD_ID = process.env.BUILD_ID
if (!BUILD_ID && !process.env.NEXT_DEPLOYMENT_ID) {
  throw new Error('Neither BUILD_ID nor NEXT_DEPLOYMENT_ID is set')
}

/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  distDir: '.next.' + (BUILD_ID ?? process.env.NEXT_DEPLOYMENT_ID),

  generateBuildId:
    BUILD_ID &&
    (async () => {
      return BUILD_ID
    }),
}

module.exports = nextConfig
