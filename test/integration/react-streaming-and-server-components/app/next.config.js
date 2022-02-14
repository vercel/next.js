const withReact18 = require('../../react-18/test/with-react-18')

module.exports = withReact18({
  reactStrictMode: true,
  onDemandEntries: {
    maxInactiveAge: 1000 * 60 * 60,
  },
  pageExtensions: ['js', 'ts', 'jsx'], // .tsx won't be treat as page,
  experimental: {
    serverComponents: true,
    runtime: 'edge',
  },
})
