const relay = require('../relay.config')

module.exports = {
  compiler: {
    relay: {
      // Intentionally omitted: Relay's multi-project config format
      // (used via `relay.config.js` -> `projects`) has no single `src`.
      artifactDirectory: './__generated__',
      language: relay.projects['project-b'].language,
    },
    externalDir: true,
  },
}
