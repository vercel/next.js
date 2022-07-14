module.exports = {
  experimental: {
    appDir: true,
    runtime: 'nodejs',
    serverComponents: true,
    legacyBrowsers: false,
    browsersListForSwc: true,
  },
  rewrites: async () => {
    return [
      {
        source: '/rewritten-to-dashboard',
        destination: '/dashboard',
      },
    ]
  },
}
