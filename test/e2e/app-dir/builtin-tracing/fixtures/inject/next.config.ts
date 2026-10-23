import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  instrumentationInject: ['./inject.js'],
}

export default nextConfig
