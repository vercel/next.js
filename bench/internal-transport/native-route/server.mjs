// node server.mjs <out/tcp|out/unix>
// A Node HTTP server that hands every request to NativeRouteManager, as
// next-server.ts does for route.go routes. Prints "READY <addr>", and on
// stdin close "STATS <requests> <cpu_us> <worker address JSON>".
import http from 'node:http'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const { NativeRouteManager } = require(
  path.join(here, 'out/js/native-route.external.js')
)

const manager = new NativeRouteManager(path.resolve(process.argv[2]), false)
let requests = 0
let cpuStart = process.cpuUsage()

const server = http.createServer((req, res) => {
  if (req.url === '/__reset') {
    requests = 0
    cpuStart = process.cpuUsage()
    res.end()
    return
  }
  requests++
  manager
    .invoke('/api/hello', 'route.native.json', req, res, req.url)
    .catch((err) => {
      res.statusCode = 500
      res.end(String(err))
    })
})
process.stdin.on('data', () => {})
process.stdin.on('end', async () => {
  const cpu = process.cpuUsage(cpuStart)
  const address = [...manager.allWorkers].map((w) => w.address)
  process.stdout.write(
    `STATS ${requests} ${cpu.user + cpu.system} ${JSON.stringify(address)}\n`
  )
  await manager.close()
  process.exit(0)
})
server.listen(0, '127.0.0.1', () => {
  process.stdout.write(`READY 127.0.0.1:${server.address().port}\n`)
})
