const path = require('path')
let handledServer = false

module.exports = {
  webpack(cfg, { isServer }) {
    console.log(cfg.entry)
    const origEntry = cfg.entry
    cfg.entry = async () => {
      const origEntries = await origEntry()

      if (isServer && !handledServer) {
        handledServer = true
        const curEntry = origEntries['pages/_app']
        origEntries['pages/_app'] = [
          path.join(__dirname, 'lib/get-data.js'),
          ...curEntry,
        ]
        console.log(origEntries)
      }
      return origEntries
    }
    return cfg
  },
}
