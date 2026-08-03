// intervals/open connections shouldn't block typegen from exiting
setInterval(() => {}, 250)

/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  typedRoutes: true,
  async redirects() {
    return [
      {
        source: '/blog/:category/:slug*',
        destination: '/posts/:category/:slug*',
        permanent: false,
      },
    ]
  },
  async rewrites() {
    return {
      beforeFiles: [],
      afterFiles: [
        {
          source: '/docs-old/:path+',
          destination: '/docs/:path+',
        },
        {
          source: '/api-legacy/:version/:endpoint*',
          destination: '/api/:version/:endpoint*',
        },
      ],
      fallback: [],
    }
  },
}

module.exports = nextConfig
