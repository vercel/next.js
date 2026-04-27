module.exports = {
  rewrites() {
    return [
      {
        source: '/rewrite-to-gsp-not-required',
        destination: '/gsp',
      },
      {
        source: '/rewrite-to-gsp',
        destination: '/gsp?foo=bar',
      },
      {
        source: '/rewrite-to-gsp-unsafe',
        destination: '/gsp?foo=bar',
        missing: [
          {
            type: 'query',
            key: 'skip',
          },
        ],
      },
    ]
  },
}
