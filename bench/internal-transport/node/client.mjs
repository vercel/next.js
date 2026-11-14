// node client.mjs <http|framed> <tcp|unix> <addr> <concurrency> <seconds> <warmupSeconds>
//
// Prints one JSON line: requests, rps, p50_us, p99_us, client_cpu_us_per_req.
import http from 'node:http'
import net from 'node:net'
import { requestHeaders, requestTarget } from './shape.mjs'
import { decodeResponseHead, encodeRequest, frameReader } from './frame.mjs'

const [proto, network, addr, concArg, secArg, warmArg] = process.argv.slice(2)
const conc = Number(concArg)

function connectOptions() {
  if (network === 'unix') return { path: addr }
  const [host, port] = addr.split(':')
  return { host, port: Number(port) }
}

let doRequest
if (proto === 'http') {
  const agent = new http.Agent({ keepAlive: true, maxSockets: conc + 1 })
  const base =
    network === 'unix'
      ? { socketPath: addr }
      : { host: connectOptions().host, port: connectOptions().port }
  const headers = Object.fromEntries(requestHeaders)
  doRequest = (_worker, target) =>
    new Promise((resolve, reject) => {
      const req = http.request(
        { ...base, agent, method: 'GET', path: target, headers },
        (res) => {
          res.on('data', () => {})
          res.on('end', resolve)
          res.on('error', reject)
        }
      )
      req.on('error', reject)
      req.end()
    })
} else {
  const conns = await Promise.all(
    Array.from(
      { length: conc + 1 },
      () =>
        new Promise((resolve, reject) => {
          const socket = net.connect(connectOptions(), () => {
            socket.setNoDelay(true)
            const conn = { socket, done: null }
            socket.on(
              'data',
              frameReader(
                (head) => decodeResponseHead(head),
                () => {},
                () => conn.done()
              )
            )
            resolve(conn)
          })
          socket.once('error', reject)
        })
    )
  )
  doRequest = (worker, target) =>
    new Promise((resolve) => {
      const conn = conns[worker]
      conn.done = resolve
      conn.socket.write(encodeRequest('GET', target, requestHeaders))
    })
}

async function run(seconds, latencies) {
  const deadline = performance.now() + seconds * 1000
  let total = 0
  await Promise.all(
    Array.from({ length: conc }, async (_, i) => {
      while (performance.now() < deadline) {
        const t = process.hrtime.bigint()
        await doRequest(i, requestTarget)
        if (latencies) latencies.push(Number(process.hrtime.bigint() - t) / 1e3)
        total++
      }
    })
  )
  return total
}

await run(Number(warmArg), null)
await doRequest(conc, '/__reset')
const latencies = []
const cpu0 = process.cpuUsage()
const t0 = performance.now()
const n = await run(Number(secArg), latencies)
const elapsed = (performance.now() - t0) / 1000
const cpu = process.cpuUsage(cpu0)
latencies.sort((a, b) => a - b)
const pct = (p) => latencies[Math.floor((latencies.length - 1) * p)]
process.stdout.write(
  JSON.stringify({
    requests: n,
    rps: n / elapsed,
    p50_us: pct(0.5),
    p99_us: pct(0.99),
    client_cpu_us_per_req: (cpu.user + cpu.system) / n,
  }) + '\n'
)
process.exit(0)
