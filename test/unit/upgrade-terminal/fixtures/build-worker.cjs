const fs = require('node:fs')

// Scripted build: progress must continue while the parent owns the menu.
process.stdout.write('BUILD_STARTED\n')
if (process.env.UPGRADE_TEST_MODE !== 'no-policy') {
  process.send({
    nextUpgradeContext: {
      distDir: '.next',
      experimental: { agenticAutoUpgrade: 'latest' },
    },
  })
}

fs.watchFile('progress', { interval: 20 }, () => {
  if (fs.existsSync('progress')) {
    fs.unwatchFile('progress')
    process.stdout.write('BUILD_PROGRESS\n', () => {
      fs.writeFileSync('progress-done', '')
    })
  }
})
fs.watchFile('finish', { interval: 20 }, () => {
  if (fs.existsSync('finish')) {
    process.stdout.write('BUILD_FINISHED\n', () => process.exit(0))
  }
})
process.on('message', (message) => {
  if (message.nextBuildShutdown) {
    if (process.env.UPGRADE_TEST_MODE === 'timeout') {
      return
    }
    process.stdout.write('BUILD_FINAL_OUTPUT\n', () => process.exit(143))
  }
})
process.on('SIGINT', () => process.exit(130))
