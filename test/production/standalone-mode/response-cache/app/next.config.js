module.exports = {
  output: 'standalone',
  trailingSlash: true,
  rewrites() {
    return {
      beforeFiles: [
        {
          source: '/news/:path/',
          destination: '/news/:path*/',
        },
      ],
      afterFiles: [
        {
          source: '/somewhere',
          destination: '/',
        },
      ],
      fallback: [
        {
          source: '/:path*',
          destination: '/:path*',
        },
        {
          source: '/(.*)',
          destination: '/seo-redirects',
        },
      ],
    }
  },
}
