const relay = require('../relay.config')

module.exports = {
  experimental: {
    turbopackDetectGlobalVirtualStore: true,
  },
  compiler: {
    relay: {
      src: './pages',
      artifactDirectory: './__generated__',
      language: relay.projects['project-b'].language,
    },
    externalDir: true,
  },
}
