/**
 * @type import('next').NextConfig
 */
module.exports = {
  env: {
    LEGACY_ENV_KEY: '1',
  },
  experimental: {
    clientRouterFilterRedirects: true,
    parallelServerCompiles: true,
    parallelServerBuildTraces: true,
    webpackBuildWorker: true,
  },
  // output: 'standalone',
  rewrites: async () => {
    return {
      beforeFiles: [
        {
          source: '/before-files-rewrite-with-empty-arrays',
          destination: '/',
          has: [],
          missing: [],
        },
      ],
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
          source: '/after-files-rewrite-with-empty-arrays',
          destination: '/',
          has: [],
          missing: [],
        },
      ],
      fallback: [
        {
          source: '/fallback-rewrite-with-empty-arrays',
          destination: '/',
          has: [],
          missing: [],
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
