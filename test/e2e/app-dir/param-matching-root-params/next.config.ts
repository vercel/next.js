import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  // Local artifact capture must not replace the real adapter in deploy tests.
  adapterPath:
    process.env.CAPTURE_QUERY_CONTRACT === '1'
      ? require.resolve('./adapter.mjs')
      : undefined,
  experimental: { paramMatching: true },
}

export default nextConfig
