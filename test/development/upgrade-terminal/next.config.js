const fs = require('node:fs')
const { spawn } = require('node:child_process')
const path = require('node:path')

// Model a config plugin whose asynchronous work outlives config evaluation.
const watcher = fs.watch(__dirname, (_event, filename) => {
  if (String(filename) !== 'emit-logs') {
    return
  }
  watcher.close()
  fs.writeSync(1, 'CONFIG_BACKGROUND_LOG\n')
  fs.writeSync(2, 'CONFIG_BACKGROUND_ERROR\n')
  const child = spawn(
    process.execPath,
    ['-e', "require('node:fs').writeSync(1, 'INHERITED_CHILD_LOG\\n')"],
    { stdio: 'inherit' }
  )
  child.on('close', () =>
    fs.writeFileSync(path.join(__dirname, 'logs-done'), 'done')
  )
})
watcher.unref()

module.exports = {
  experimental: { agenticAutoUpgrade: 'latest' },
}
