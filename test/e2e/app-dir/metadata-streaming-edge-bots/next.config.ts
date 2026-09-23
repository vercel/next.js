import type { NextConfig } from 'next'

const config: NextConfig = {
  // Cache Components does not support the Edge runtime.
  cacheComponents: false,
}

export default config
