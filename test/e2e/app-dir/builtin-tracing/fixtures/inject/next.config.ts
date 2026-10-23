import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  injectInstrumentation: ['./inject.js'],
}

export default nextConfig
