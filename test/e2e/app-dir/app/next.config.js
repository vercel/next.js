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
