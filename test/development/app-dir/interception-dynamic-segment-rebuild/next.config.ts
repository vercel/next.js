import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  async rewrites() {
    return {
      // User-defined `beforeFiles` rewrites. They must survive the dev server
      // regenerating its interception rewrites on every rebuild, including one
      // that, like the generated rewrites, is conditioned on `Next-Url`.
      beforeFiles: [
        { source: '/user-rewrite', destination: '/list/2' },
        {
          source: '/user-next-url-rewrite',
          destination: '/list/3',
          has: [{ type: 'header', key: 'next-url', value: '/list' }],
        },
      ],
      afterFiles: [],
      fallback: [],
    }
  },
}

export default nextConfig
