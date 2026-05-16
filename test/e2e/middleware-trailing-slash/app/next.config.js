module.exports = {
  trailingSlash: true,
  redirects() {
    return [
      {
        source: '/redirect-1',
        destination: '/somewhere/else/',
        permanent: false,
      },
    ]
  },
  rewrites() {
    return [
      {
        source: '/rewrite-1',
        destination: '/ssr-page?from=config',
      },
      {
        source: '/rewrite-2',
        destination: '/about/a?from=next-config',
      },
      {
        source: '/sha',
        destination: '/shallow',
      },
      {
        source: '/rewrite-3',
        destination: '/blog/middleware-rewrite?hello=config',
      },
    ]
  },
}
