import type { NextConfig } from 'next'

const config: NextConfig = (phase, { defaultConfig }) => {
  const nextConfig = {
    ...defaultConfig,
    env: {
      customKey: 'my-value',
    },
  }
  return nextConfig
}

export default config
