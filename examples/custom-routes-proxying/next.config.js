module.exports = {
  experimental: {
    async rewrites() {
      return [
        // we need to define a no-op rewrite to trigger checking
        // all pages/static files before we attempt proxying
        {
          source: '/:path*',
          destination: '/:path*',
        },
        {
          source: '/:path*',
          destination: `http://localhost:${process.env.UPSTREAM_PORT}/:path*`,
        },
      ]
    },
  },
}
