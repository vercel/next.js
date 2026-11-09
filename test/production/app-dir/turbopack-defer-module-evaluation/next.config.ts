import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    turbopackDeferModuleEvaluation:
      process.env.TEST_DEFER_MODULE_EVALUATION === 'true',
    useCache: true,
  },
}

export default nextConfig
