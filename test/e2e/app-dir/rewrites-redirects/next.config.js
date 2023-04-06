module.exports = {
  reactStrictMode: true,
  experimental: {
    appDir: true,
  },
  async rewrites() {
    return [
      {
        source: '/:from/:to/config-rewrite-before',
        destination: '/:to/:to/config-rewrite-after',
      },
    ]
  },
  async redirects() {
    return [
      {
        source: '/:from/:to/config-redirect-before',
        destination: '/:to/:to/config-redirect-after',
        permanent: true,
      },
      {
        source: '/:from/:to/config-redirect-catchall-before/:path*',
        destination: '/:to/:to/config-redirect-catchall-after/:path*',
        permanent: true,
      },
    ]
  },
}
