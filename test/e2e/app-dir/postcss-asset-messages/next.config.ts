import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Enable local manifest assertions; deployment adapters set this themselves.
  supportsImmutableAssets:
    process.env.NEXT_TEST_MODE === 'start' ? true : undefined,
}

export default nextConfig
