import type { NextConfig } from 'next'
import { foobarbaz } from './foo.ts'

// top-level await will only work in Native TS mode.
// This is to ensure that the test is running in Native TS mode.
await Promise.resolve()

const nextConfig: NextConfig = {
  env: {
    foobarbaz,
  },
}

export default nextConfig
