const withReact18 = require('../../react-18/test/with-react-18')

module.exports = withReact18({
  experimental: {
    concurrentFeatures: true,
  },
})
