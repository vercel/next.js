module.exports = {
  experimental: {
    appDir: true,
    runtime: 'nodejs',
    reactRoot: true,
    serverComponents: true,
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
