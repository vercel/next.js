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
      ],
      fallback: [],
    }
  },
}

module.exports = nextConfig
