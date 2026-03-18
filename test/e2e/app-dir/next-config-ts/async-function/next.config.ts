import type { NextConfig } from 'next'

const nextConfigAsyncFunction = async (phase, { defaultConfig }) => {
  const nextConfig: NextConfig = {
    ...defaultConfig,
    env: {
      foo: phase ? 'foo' : 'bar',
    },
  }
  return nextConfig
}

export default nextConfigAsyncFunction
