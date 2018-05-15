const withSass = require('@zeit/next-sass')

module.exports = withSass({
  rootPaths: ['.', './shared-app-files']
})
