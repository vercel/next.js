module.exports = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/config-rewrite-before',
        destination: '/config-rewrite-after',
      },
    ]
  },
  async redirects() {
    return [
      {
        source: '/config-redirect-before',
        destination: '/config-redirect-after',
        permanent: true,
      },
      {
        source: '/config-redirect-catchall-before/:path*',
        destination: '/config-redirect-catchall-after/:path*',
        permanent: true,
      },
    ]
  },
}
