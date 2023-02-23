export default {
  experimental: {
    appDir: true,
    typedRoutes: true,
  },
  async rewrites() {
    return [
      {
        source: '/rewrite',
        destination: 'https://nextjs.org',
      },
    ]
  },
  async redirects() {
    return [
      {
        source: '/redirect',
        destination: 'https://nextjs.org',
        permanent: false,
      },
    ]
  },
}
