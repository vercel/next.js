module.exports = {
  rewrites: () => {
    return [
      {
        source: '/get-pathname/:path/rewrite-source',
        destination: '/get-pathname/:path/rewrite-destination',
      },
    ]
  },
  redirects: () => {
    return [
      {
        source: '/redirect/a',
        destination: '/redirect-dest',
        permanent: false,
      },
    ]
  },
}
