const buildId = process.env.NEXT_PUBLIC_BUILD_ID
if (!buildId && !process.env.NEXT_DEPLOYMENT_ID) {
  throw new Error('Neither NEXT_PUBLIC_BUILD_ID nor NEXT_DEPLOYMENT_ID is set')
}

/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  distDir: '.next' + (process.env.DIST_DIR || ''),

  generateBuildId:
    buildId &&
    (async () => {
      return buildId
    }),
}

module.exports = nextConfig
