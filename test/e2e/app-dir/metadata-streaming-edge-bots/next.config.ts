import type { NextConfig } from 'next'

const config: NextConfig = {
  // Cache Components does not support the Edge runtime.
  cacheComponents: false,
  experimental: {
    // CI enables this alongside Cache Components; it requires that feature.
    cachedNavigations: false,
  },
}

export default config
