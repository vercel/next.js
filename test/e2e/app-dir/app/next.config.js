module.exports = {
  experimental: {
    appDir: true,
    runtime: 'nodejs',
    serverComponents: true,
    legacyBrowsers: false,
    browsersListForSwc: true,
  },
  // assetPrefix: '/assets',
  rewrites: async () => {
    return [
      {
        source: '/rewritten-to-dashboard',
        destination: '/dashboard',
      },
    ]
  },
}
