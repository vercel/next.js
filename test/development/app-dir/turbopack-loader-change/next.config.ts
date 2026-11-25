import type { NextConfig } from 'next'
import path from 'node:path'

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      '*.value.txt': {
        loaders: [path.resolve(__dirname, './loader.js')],
        as: '*.js',
      },
    },
  },
}

export default nextConfig
