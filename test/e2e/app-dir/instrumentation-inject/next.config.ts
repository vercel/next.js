import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  instrumentationInject: [
    './injected/first.ts',
    'instrumentation-test-package/setup',
    './injected/last.ts',
  ],
}

export default nextConfig
