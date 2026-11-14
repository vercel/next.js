// Runs the transport matrix and prints a Markdown table plus JSON.
//
//   node run.mjs <tbench binary> [seconds=5] [warmup=1] [label]
//
// Directions:
//   node->go  Node client, Go server  (Node -> route.go worker today)
//   go->node  Go client, Node server  (front -> Node)
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const [tbench, secArg = '5', warmArg = '1', label = os.platform()] =
  process.argv.slice(2)

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tbench-'))
const socketPath = path.join(dir, 's.sock')

function lines(stream, onLine) {
  readline.createInterface({ input: stream }).on('line', onLine)
}

async function startServer(cmd, args) {
  const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'inherit'] })
  let stats
  const statsDone = new Promise((resolve) => child.once('exit', resolve))
  const addr = await new Promise((resolve, reject) => {
    child.once('error', reject)
    lines(child.stdout, (line) => {
      if (line.startsWith('READY ')) resolve(line.slice(6))
      else if (line.startsWith('STATS ')) {
        const [, n, cpu] = line.split(' ')
        stats = { requests: Number(n), cpu: Number(cpu) }
      }
    })
  })
  return {
    addr,
    async stop() {
      child.stdin.end()
      await statsDone
      return stats
    },
  }
}

function runClient(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'inherit'] })
    let out = ''
    child.stdout.on('data', (d) => (out += d))
    child.once('exit', (code) =>
      code === 0
        ? resolve(JSON.parse(out))
        : reject(new Error(`client ${code}`))
    )
  })
}

const node = process.execPath
// TBENCH_SOCKBUF=<bytes> makes the Go side set SO_SNDBUF/SO_RCVBUF on Unix
// connections (needs a tbench built with -sockbuf).
const sockbuf = process.env.TBENCH_SOCKBUF
  ? ['-sockbuf', process.env.TBENCH_SOCKBUF]
  : []
const results = []
for (const direction of ['node->go', 'go->node']) {
  for (const size of [13, 65536]) {
    for (const conc of [1, 32]) {
      for (const proto of ['http', 'framed']) {
        for (const network of ['tcp', 'unix']) {
          const server =
            direction === 'node->go'
              ? await startServer(tbench, [
                  'server',
                  '-proto',
                  proto,
                  '-net',
                  network,
                  '-addr',
                  socketPath,
                  '-size',
                  String(size),
                  ...sockbuf,
                ])
              : await startServer(node, [
                  path.join(here, 'node/server.mjs'),
                  proto,
                  network,
                  socketPath,
                  String(size),
                ])
          const client =
            direction === 'node->go'
              ? await runClient(node, [
                  path.join(here, 'node/client.mjs'),
                  proto,
                  network,
                  server.addr,
                  String(conc),
                  secArg,
                  warmArg,
                ])
              : await runClient(tbench, [
                  'client',
                  '-proto',
                  proto,
                  '-net',
                  network,
                  '-addr',
                  server.addr,
                  '-c',
                  String(conc),
                  '-d',
                  `${secArg}s`,
                  '-warmup',
                  `${warmArg}s`,
                  ...sockbuf,
                ])
          const stats = await server.stop()
          const row = {
            direction,
            size,
            conc,
            proto,
            network,
            rps: Math.round(client.rps),
            p50_us: Math.round(client.p50_us),
            p99_us: Math.round(client.p99_us),
            client_cpu_us: +client.client_cpu_us_per_req.toFixed(1),
            server_cpu_us: +(stats.cpu / stats.requests).toFixed(1),
          }
          results.push(row)
          console.error(JSON.stringify(row))
        }
      }
    }
  }
}
fs.rmSync(dir, { recursive: true, force: true })

const header =
  '| direction | body | conc | proto | net | req/s | p50 µs | p99 µs | client CPU µs/req | server CPU µs/req |'
const sep = '|' + ' --- |'.repeat(10)
const table = [header, sep]
for (const r of results) {
  table.push(
    `| ${r.direction} | ${r.size} | ${r.conc} | ${r.proto} | ${r.network} | ${r.rps} | ${r.p50_us} | ${r.p99_us} | ${r.client_cpu_us} | ${r.server_cpu_us} |`
  )
}
const outDir = path.join(here, 'results')
fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(
  path.join(outDir, `${label}.json`),
  JSON.stringify(
    {
      label,
      node: process.version,
      platform: `${os.platform()} ${os.arch()} ${os.release()}`,
      cpus: os.cpus().length,
      results,
    },
    null,
    2
  )
)
fs.writeFileSync(path.join(outDir, `${label}.md`), table.join('\n') + '\n')
console.log(table.join('\n'))
