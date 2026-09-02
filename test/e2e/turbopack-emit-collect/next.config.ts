import type { NextConfig } from 'next'

const config: NextConfig = {
  experimental: {
    turbopackModuleIds: 'named',
    preloadEntriesOnStart: false,
  },
}

export default config
