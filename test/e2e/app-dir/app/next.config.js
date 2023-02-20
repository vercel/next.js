module.exports = {
  experimental: {
    appDir: true,
    sri: {
      algorithm: 'sha256',
    },
  },
  // output: 'standalone',
  rewrites: async () => {
    return {
      afterFiles: [
        {
          source: '/rewritten-to-dashboard',
          destination: '/dashboard',
        },
        {
          source: '/search-params-prop-rewrite',
          destination:
            '/search-params-prop?first=value&second=other%20value&third',
        },
        {
          source: '/search-params-prop-server-rewrite',
          destination:
            '/search-params-prop/server?first=value&second=other%20value&third',
        },
      ],
    }
  },
}
