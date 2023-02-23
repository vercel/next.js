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

  redirects: async () => {
    return [
      {
        source: '/redirect-1',
        destination: '/somewhere',
        permanent: false,
      },
      {
        source: '/redirect-2',
        destination: 'https://example.vercel.sh',
        permanent: false,
      },
      {
        source: '/redirect-3/some/:path*',
        destination: 'https://example.vercel.sh',
        permanent: false,
      },
      {
        source: '/redirect-4/:path*',
        destination: 'https://example.vercel.sh',
        permanent: false,
      },
    ]
  },
}
