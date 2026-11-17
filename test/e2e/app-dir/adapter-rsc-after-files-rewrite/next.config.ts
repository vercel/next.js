import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  basePath: '/base',
  async rewrites() {
    return {
      beforeFiles: [],
      // A catch-all user rewrite. It must not capture the RSC requests of the
      // fixed-path pages, which resolve before user afterFiles rewrites.
      afterFiles: [{ source: '/:slug', destination: '/rewritten/:slug' }],
      fallback: [],
    }
  },
}

export default nextConfig
