// intervals/open connections shouldn't block build from exiting
setInterval(() => {}, 250)

module.exports = {
  onDemandEntries: {
    // Make sure entries are not getting disposed.
    maxInactiveAge: 1000 * 60 * 60,
  },
  rewrites() {
    // add a rewrite so the code isn't dead-code eliminated
    return [
      {
        source: '/some-rewrite',
        destination: '/',
      },
    ]
  },
  redirects() {
    return [
      {
        source: '/redirect/me/to-about/:lang',
        destination: '/:lang/about',
        permanent: false,
      },
      {
        source: '/nonexistent',
        destination: '/about',
        permanent: false,
      },
      {
        source: '/shadowed-page',
        destination: '/about',
        permanent: false,
      },
      {
        source: '/redirect-query-test/:path',
        destination: '/about?foo=:path',
        permanent: false,
      },
    ]
  },
  images: {
    // Make sure we have sane default CSP, even when SVG is enabled
    dangerouslyAllowSVG: true,
  },
}
