import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  experimental: {
    // On by default with Cache Components. The spike builds once with it off.
    cachedNavigations: process.env.PPR_CDN_MODE_CACHED_NAVIGATIONS !== 'false',
    // The nav inspector check builds with the testing API exposed.
    exposeTestingApiInProductionBuild:
      process.env.PPR_CDN_MODE_TESTING_API === 'true',
  },
}

export default nextConfig
