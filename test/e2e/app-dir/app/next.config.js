module.exports = {
  experimental: {
    appDir: true,
    sri: {
      algorithm: 'sha256',
    },
  },
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
        {
          source: '/rewritten-use-search-params',
          destination:
            '/hooks/use-search-params?first=value&second=other%20value&third',
        },
        {
          source: '/rewritten-use-pathname',
          destination: '/hooks/use-pathname',
        },
        {
          source: '/hooks/use-selected-layout-segment/rewritten',
          destination:
            '/hooks/use-selected-layout-segment/first/slug3/second/catch/all',
        },
      ],
    }
  },
  redirects: () => {
    return [
      {
        source: '/redirect/a',
        destination: '/dashboard',
        permanent: false,
      },
    ]
  },
}
