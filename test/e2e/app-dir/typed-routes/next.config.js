/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  async redirects() {
    return [
      {
        source: '/project/:slug',
        destination: '/project/:slug',
        permanent: true,
      },
      {
        source: '/blog/:category/:slug*',
        destination: '/posts/:category/:slug*',
        permanent: false,
      },
      {
        source: '/optional/:param?',
        destination: '/fallback',
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
