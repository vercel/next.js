module.exports = {
  rewrites() {
    return [
      {
        source: '/rewrite-simple',
        destination: '/another',
      },
      {
        source: '/rewrite-with-has',
        has: [
          {
            type: 'query',
            key: 'hasQuery',
          },
        ],
        destination: '/another',
      },
    ]
  },
}
