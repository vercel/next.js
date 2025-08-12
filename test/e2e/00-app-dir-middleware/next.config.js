module.exports = {
  experimental: {
    appDir: true,
    runtime: 'nodejs',
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
