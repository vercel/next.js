module.exports = {
  reactStrictMode: true,
  experimental: {
    appDir: true,
  },
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
    ]
  },
}
