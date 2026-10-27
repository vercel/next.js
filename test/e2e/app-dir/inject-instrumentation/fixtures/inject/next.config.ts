import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  injectInstrumentation: [
    './injected/instrumentation.js',
    './injected/second.js',
  ],
}

export default nextConfig
