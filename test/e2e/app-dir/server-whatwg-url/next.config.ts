import type { NextConfig } from 'next'

const config: NextConfig = {
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: '/url-chain/:slug',
          destination: '/url-stage/:slug?fixed=a%2Fb&item=dest1&item=dest2',
        },
        { source: '/url-stage/:slug', destination: '/result?captured=:slug' },
        {
          source: '/url-query/:slug',
          destination: '/query?added=hello%20world',
        },
        {
          source: '/url-condition',
          has: [{ type: 'query', key: 'item', value: 'last' }],
          destination: '/result?matched=yes',
        },
      ],
      afterFiles: [],
      fallback: [],
    }
  },
  async redirects() {
    return [
      {
        source: '/url-redirect/:slug',
        destination: '/echo?value=:slug&encoded=a%2Fb',
        permanent: false,
      },
    ]
  },
}

export default config
