module.exports = {
  experimental: {
    clientRouterFilterRedirects: true,
    parallelServerCompiles: true,
    parallelServerBuildTraces: true,
    webpackBuildWorker: true,
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

  redirects: async () => {
    return [
      {
        source: '/redirect-1',
        destination: 'https://example.vercel.sh',
        permanent: false,
      },
      {
        source: '/redirect-2',
        destination: 'https://example.vercel.sh',
        permanent: false,
      },
      {
        source: '/blog/old-post',
        destination: 'https://example.vercel.sh',
        permanent: false,
      },
      {
        source: '/redirect-3/some',
        destination: 'https://example.vercel.sh',
        permanent: false,
      },
      {
        source: '/redirect-4',
        destination: 'https://example.vercel.sh',
        permanent: false,
      },
      {
        source: '/:path/to-redirect',
        destination: 'https://example.vercel.sh',
        permanent: false,
      },
    ]
  },
}
