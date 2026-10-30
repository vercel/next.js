const fs = require('fs')
const path = require('path')

// The steps create EXPORT_FAIL to make exportPathMap fail after startup.
module.exports = {
  // Polling is only needed where FSEvents is unavailable (the Claude Code sandbox).
  watchOptions: { pollIntervalMs: 500 },
  exportPathMap(defaultMap) {
    if (fs.existsSync(path.join(__dirname, 'EXPORT_FAIL'))) {
      throw new Error('exportPathMap failed (simulated)')
    }
    return defaultMap
  },
}
