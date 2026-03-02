import type { NextConfig } from 'next'

const config: NextConfig = {
  experimental: {
    turbopackModuleIds: 'named',
  },
}

export default config
