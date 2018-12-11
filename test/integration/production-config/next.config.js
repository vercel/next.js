const withCSS = require('@zeit/next-css')
const withSass = require('@zeit/next-sass')
const path = require('path')
module.exports = withCSS(withSass({
  onDemandEntries: {
    // Make sure entries are not getting disposed.
    maxInactiveAge: 1000 * 60 * 60
  },
  contentSecurityPolicy: "default-src 'none'; script-src 'self'; style-src 'nonce-{style-nonce}' 'unsafe-inline';connect-src 'self';img-src 'self';",
  webpack (config, {buildId}) {
    // When next-css is `npm link`ed we have to solve loaders from the project root
    const nextLocation = path.join(require.resolve('next/package.json'), '../')
    const nextCssNodeModulesLocation = path.join(
      require.resolve('@zeit/next-css'),
      '../../../node_modules'
    )

    if (nextCssNodeModulesLocation.indexOf(nextLocation) === -1) {
      config.resolveLoader.modules.push(nextCssNodeModulesLocation)
    }

    return config
  },
  async generateBuildId () {
    return 'custom-buildid'
  }
}))
