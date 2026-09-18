// Protocol fixture only: the development suite exercises the real Next server.
const { createServer } = require('node:http')
const { spawn } = require('node:child_process')
const { readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')

process.on('message', (message) => {
  if (!message.nextWorkerOptions) return
  const { dir, port, hostname, isDev } = message.nextWorkerOptions
  if (isDev !== (process.env.NODE_ENV !== 'production'))
    throw new Error('Server mode mismatch')
  if (!isDev && process.env.NEXT_PHASE === 'phase-production-build')
    throw new Error('Leaked build phase')
  const scenario = readFileSync(join(dir, 'scenario'), 'utf8')
  if (
    scenario === 'base-path' &&
    !message.nextWorkerOptions.browserFixtureHost.routePrefix.startsWith(
      '/__next_testing_'
    )
  )
    throw new Error('Logical route was externally prefixed')
  writeFileSync(join(dir, 'server.pid'), String(process.pid))
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    stdio: 'inherit',
  })
  writeFileSync(join(dir, 'descendant.pid'), String(child.pid))
  if (scenario === 'exit') {
    console.error('fixture acquisition failed')
    process.exit(7)
  }
  if (scenario === 'hang') {
    process.on('SIGTERM', () => {})
    return
  }
  const server = createServer((request, response) => {
    response.end('ready')
    if (request.url === '/exit') setImmediate(() => process.exit(9))
  })
  server.listen(port, hostname, () => {
    process.send({
      nextServerReady: true,
      port: String(server.address().port),
      distDir: scenario === 'wrong-output' ? '.other' : '.next',
      basePath: scenario === 'base-path' ? '/docs' : '',
    })
  })
  if (scenario !== 'shutdown-signal') {
    process.on('SIGTERM', () => {
      if (scenario === 'shutdown-hang') return
      if (scenario.startsWith('shutdown-error-')) {
        console.error('fixture shutdown failed')
        process.exit(Number(scenario.slice('shutdown-error-'.length)))
      }
      server.close(() => process.exit(scenario === 'shutdown-143' ? 143 : 0))
    })
  }
})
process.send({ nextWorkerReady: true })
