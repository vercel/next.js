const path = require('path')

module.exports = {
  webpack(cfg, { isServer, nextRuntime }) {
    console.log(cfg.entry)
    const origEntry = cfg.entry
    cfg.entry = async () => {
      const origEntries = await origEntry()

      if (isServer && nextRuntime === 'nodejs') {
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
  experimental: {
    outputFileTracingIncludes: {
      '/index': ['include-me/*'],
    },
    outputFileTracingExcludes: {
      '/index': ['public/exclude-me/**/*'],
    },
    turbotrace: {
      contextDirectory: path.join(__dirname, '..', '..', '..', '..'),
      memoryLimit: 2048,
    },
    webpackBuildWorker: true,
  },
}
