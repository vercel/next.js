const fs = require('node:fs')
const { spawn } = require('node:child_process')

// Scripted worker for the CLI-parent tests; it speaks IPC but serves no HTTP.
// Files trigger output/restart after the test has observed the prompt opening.
process.on('SIGTERM', () => process.exit(143))
process.on('SIGINT', () => process.exit(130))
process.on('message', (message) => {
  if (message.nextWorkerOptions) {
    fs.writeSync(1, `WORKER_STARTED:${process.pid}\n`)
    if (process.env.NEXT_PRIVATE_UPGRADE_PROMPT === '1') {
      process.send({
        nextUpgradeContext: {
          distDir: '.next',
          experimental: { agenticAutoUpgrade: 'latest' },
        },
      })
    }
    process.send({ nextServerReady: true })
    if (process.env.UPGRADE_TEST_MODE === 'pressure') {
      fs.watchFile('pressure', { interval: 20 }, () => {
        if (fs.existsSync('pressure')) {
          fs.unwatchFile('pressure')
          process.stdout.write(Buffer.alloc(1024 * 1024, 'x'), () => {
            process.stdout.write('\nWORKER_AFTER_PRESSURE\n')
          })
        }
      })
    }
    if (process.env.UPGRADE_TEST_MODE === 'restart') {
      if (!fs.existsSync('restart')) {
        fs.watchFile('restart', { interval: 20 }, () => {
          if (fs.existsSync('restart')) {
            // Next interprets exit code 77 as a request to restart the worker.
            process.exit(77)
          }
        })
      }
    }
  }
  if (message.nextWorkerShutdown) {
    if (process.env.UPGRADE_TEST_MODE === 'timeout') {
      // Stay alive without acknowledging cleanup, forcing the parent's timeout.
      return
    }
    if (
      process.env.UPGRADE_TEST_MODE === 'descendant' &&
      process.platform !== 'win32'
    ) {
      // POSIX keeps the inherited pipe open until this child finishes.
      spawn(
        process.execPath,
        [
          '-e',
          "setTimeout(() => process.stdout.write('DESCENDANT_DONE\\n'), 100)",
        ],
        { stdio: 'inherit' }
      )
    }
    // A normal exit alone is insufficient: failure explicitly rejects cleanup.
    process.send(
      { nextWorkerShutdownResult: process.env.UPGRADE_TEST_MODE !== 'failure' },
      () => {
        fs.writeSync(1, 'WORKER_FINAL_OUTPUT\n')
        process.exit(143)
      }
    )
  }
})
process.send({ nextWorkerReady: true })
