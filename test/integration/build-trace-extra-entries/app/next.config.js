const path = require('path')

module.exports = {
  experimental: {
    nftTracing: true,
  },
  webpack(cfg, { isServer }) {
    console.log(cfg.entry)
    const origEntry = cfg.entry
    cfg.entry = async () => {
      const origEntries = await origEntry()

      if (isServer) {
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
