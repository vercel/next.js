const { writeFileSync } = require('node:fs')
const { join } = require('node:path')
process.on('message', (message) => {
  if (!message?.nextWorkerOptions) return
  const { dir, isDev, skipAgentFiles } = message.nextWorkerOptions
  writeFileSync(
    join(dir, 'worker-options.json'),
    JSON.stringify({ isDev, skipAgentFiles })
  )
})
require('./protocol-server.cjs')
