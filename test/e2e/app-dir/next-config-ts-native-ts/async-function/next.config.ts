import type { NextConfig } from 'next'

// top-level await will only work in Native TS mode.
// This is to ensure that the test is running in Native TS mode.
await Promise.resolve()

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
