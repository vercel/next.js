import path from 'node:path'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, '..'),
  outputFileTracingExcludes: {
    '*': ['../target/**'],
  },
}

export default nextConfig
