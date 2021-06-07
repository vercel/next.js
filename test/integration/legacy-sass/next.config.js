const withSass = require('@zeit/next-sass')
module.exports = withSass({
  // @zeit/next-sass is not supported with webpack 5
  webpack5: false,
})
