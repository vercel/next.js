const path = require('path')

module.exports = {
  webpack(cfg, { isServer, nextRuntime }) {
    const origEntry = cfg.entry
    cfg.entry = async () => {
      const origEntries = await origEntry()

      if (isServer && nextRuntime === 'nodejs') {
        const origImport = origEntries['pages/_app'].import
        origEntries['pages/_app'].import = [
          path.join(__dirname, 'lib/get-data.js'),
          origImport,
        ]
      }
      return origEntries
    }
    return cfg
  },
  experimental: {
    outputFileTracingIncludes: {
      '/index': ['include-me/**/*'],
    },
    outputFileTracingExcludes: {
      '/index': ['public/exclude-me/**/*'],
    },
  },
}
