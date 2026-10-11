const { fork } = require('node:child_process')
const { join } = require('node:path')
const worker = fork(join(__dirname, 'worker.cjs'), [], {
  detached: true,
  stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  env:
    process.argv[2] === 'immediate'
      ? {
          ...process.env,
          NODE_OPTIONS: `--require=${JSON.stringify(join(__dirname, 'delayed-start.cjs'))} ${process.env.NODE_OPTIONS}`,
        }
      : process.env,
})
if (process.argv[2] === 'immediate') {
  worker.disconnect()
  worker.unref()
  process.exit(0)
}
worker.once('message', () => {
  worker.disconnect()
  worker.unref()
  if (process.argv[2] === 'exit') process.exit(0)
  process.on('SIGTERM', () => {})
  setInterval(() => {}, 1000)
})
