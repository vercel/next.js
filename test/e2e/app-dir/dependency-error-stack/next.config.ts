import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  experimental: {
    devValidationWorker: process.env.TEST_VALIDATION_WORKER === 'true',
  },
  serverExternalPackages: ['external-time'],
  transpilePackages: ['bundled-time'],
}

export default nextConfig
