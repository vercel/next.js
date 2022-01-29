const relay = require('../relay.config')

module.exports = {
  experimental: {
    relay: {
      src: './pages',
      artifactsDirectory: '../__generated__',
      language: relay.projects['project-b'].language,
    },
    externalDir: true,
  },
}
