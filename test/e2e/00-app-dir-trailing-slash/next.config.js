module.exports = {
  trailingSlash: true,
  experimental: {
    appDir: true,
  },
  rewrites: async () => {
    return [
      {
        source: '/rewritten-to-dashboard/',
        destination: '/dashboard/',
      },
      {
        source: '/:locale/t/size-chart/:chart/',
        destination: '/dashboard',
      },
    ]
  },
}
