import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Reports client hooks accessed outside of Suspense in the dev overlay,
  // with the owner stack of the Client Component.
  cacheComponents: true,
}

export default nextConfig
