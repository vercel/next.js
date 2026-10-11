// This adapter runs only in B's dedicated application-server process group.
// It translates the supervisor protocol into Next's normal server startup.
const { createRequire } = require('node:module')
const { join } = require('node:path')

let started = false
process.on('message', (message) => {
  if (!message || typeof message !== 'object' || !('type' in message)) return
  if (message.type === 'cancel') {
    // Once installed, start-server's real signal handler drains the server.
    // Before installation, the default signal action terminates acquisition.
    process.kill(process.pid, 'SIGTERM')
    return
  }
  if (message.type !== 'run' || started || !('input' in message)) return
  started = true
  const input = message.input
  if (
    !input ||
    typeof input !== 'object' ||
    !('projectDir' in input) ||
    typeof input.projectDir !== 'string'
  ) {
    throw new Error('Invalid Next application-server input')
  }
  process.send?.({ nextApplicationServerProcess: true, pid: process.pid })
  const requireFromProject = createRequire(
    join(input.projectDir, 'package.json')
  )
  requireFromProject('next/dist/server/lib/start-server')
  process.emit('message', {
    nextWorkerOptions: {
      dir: input.projectDir,
      isDev: input.mode !== 'production',
      browserFixtureHost: input.browserFixtureHost,
      hostname: '127.0.0.1',
      port: 0,
      allowRetry: false,
    },
  })
})
