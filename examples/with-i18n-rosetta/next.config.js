module.exports = {
  experimental: {
    pages404: true,
    polyfillsOptimization: true,
    redirects() {
      return [
        {
          source: '/',
          permanent: true,
          destination: '/en',
        },
        {
          source: '/contact',
          destination: '/en/contact',
          permanent: true,
        },
        {
          source: '/dashboard',
          destination: '/en/dashboard',
          permanent: true,
        },
      ]
    },
  },
}
