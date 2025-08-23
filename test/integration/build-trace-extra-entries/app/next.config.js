const path = require('path')

module.exports = {
  webpack(cfg, { isServer, nextRuntime }) {
    const origEntry = cfg.entry
    cfg.entry = async () => {
      const origEntries = await origEntry()

      if (isServer && nextRuntime === 'nodejs') {
        const curEntry = origEntries['pages/_app']
        origEntries['pages/_app'] = [
          path.join(__dirname, 'lib/get-data.js'),
          ...curEntry,
        ]
      }
      return origEntries
    }
    return cfg
  },
  outputFileTracingIncludes: {
    '/index': ['include-me/**/*'],
    '/route1': ['./include-me/**/*', 'node_modules/pkg-behind-symlink/*'],
    '/*': ['include-me-global.txt'],
  },
  outputFileTracingExcludes: {
    '/index': ['public/exclude-me/**/*'],
    '/route1': ['./public/exclude-me/**/*'],
  },
}
