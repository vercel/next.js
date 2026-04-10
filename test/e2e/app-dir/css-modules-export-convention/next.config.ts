import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  turbopack: {
    cssModules: {
      exportLocalsConvention: 'camelCaseOnly',
    },
  },
}

export default nextConfig
