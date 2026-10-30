const fs = require('fs')
const path = require('path')

// The steps write REWRITES_MODE to make rewrites() fail or stall after startup,
// like a rewrites() that loads rules from a CMS.
module.exports = {
  // Polling is only needed where FSEvents is unavailable (the Claude Code sandbox).
  watchOptions: { pollIntervalMs: 500 },
  async rewrites() {
    const file = path.join(__dirname, 'REWRITES_MODE')
    const mode = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim() : ''
    if (mode === 'throw')
      throw new Error('rewrites source unavailable (simulated)')
    if (mode === 'slow')
      await new Promise((resolve) => setTimeout(resolve, 8000))
    return []
  },
}
