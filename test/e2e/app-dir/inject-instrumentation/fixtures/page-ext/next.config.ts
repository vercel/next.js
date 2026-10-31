import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  pageExtensions: ['page.ts', 'tsx', 'ts'],
  instrumentationInject: [
    './injected/instrumentation.js',
    './injected/second.js',
  ],
}

export default nextConfig
