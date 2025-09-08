import type { NextConfig } from 'next'

// top-level await will only work in Native TS mode.
// This is to ensure that the test is running in Native TS mode.
await Promise.resolve()

const nextConfig: NextConfig = {
  env: {
    foo: 'foo',
  },
}

export { nextConfig as default }
