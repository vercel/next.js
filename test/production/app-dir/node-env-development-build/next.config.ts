import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    // Lets the test exercise both the early-exit path and the end-of-build
    // export failure summary.
    prerenderEarlyExit: process.env.TEST_PRERENDER_EARLY_EXIT !== 'false',
    ...(process.env.TEST_ALLOW_DEVELOPMENT_BUILD === 'true'
      ? { allowDevelopmentBuild: true }
      : {}),
  },
}

export default nextConfig
