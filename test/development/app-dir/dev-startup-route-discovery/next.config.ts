import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  async rewrites() {
    return {
      beforeFiles: [{ source: '/before-rewrite', destination: '/legacy' }],
      afterFiles: [{ source: '/after-rewrite', destination: '/' }],
      fallback: [
        { source: '/fallback-rewrite/:slug', destination: '/dynamic/:slug' },
      ],
    }
  },
}

export default nextConfig
