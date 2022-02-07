const relay = require('../relay.config')

module.exports = {
  experimental: {
    relay: {
      src: './pages',
      artifactDirectory: './__generated__',
      language: relay.projects['project-b'].language,
    },
    externalDir: true,
  },
}
