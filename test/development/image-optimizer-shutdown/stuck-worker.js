const { writeSync } = require('fs')

process.on('SIGTERM', () => {})
process.on('message', () => {
  writeSync(1, `IMAGE_WORKER_STUCK:${process.pid}\n`)
  // Block signal callbacks and IPC-disconnect handling, not just the request.
  for (;;) {}
})
process.on('disconnect', () => process.exit(0))
