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
