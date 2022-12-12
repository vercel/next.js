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
}
