// node run.mjs <tbench> [seconds] [warmup] [label]
// Load: tbench's Go HTTP client -> Node (server.mjs) -> route.go worker.
// Node's CPU per request is the number that matters: it pays for the hop.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const [tbench, sec = '5', warm = '1', label = process.platform] =
  process.argv.slice(2)
const rows = []
for (let round = 1; round <= 3; round++) {
  for (const conc of [1, 32]) {
    for (const variant of ['tcp', 'unix']) {
      const server = spawn(
        process.execPath,
        [
          path.join(here, 'server.mjs'),
          path.join(here, process.env.WORKERS || 'out', variant),
        ],
        { stdio: ['pipe', 'pipe', 'inherit'] }
      )
      let stats
      const exited = new Promise((r) => server.once('exit', r))
      const addr = await new Promise((resolve) => {
        readline
          .createInterface({ input: server.stdout })
          .on('line', (line) => {
            if (line.startsWith('READY ')) resolve(line.slice(6))
            if (line.startsWith('STATS ')) {
              const [, n, cpu, ...rest] = line.split(' ')
              stats = {
                n: Number(n),
                cpu: Number(cpu),
                address: rest.join(' '),
              }
            }
          })
      })
      const out = await new Promise((resolve, reject) => {
        const c = spawn(
          tbench,
          [
            'client',
            '-proto',
            'http',
            '-net',
            'tcp',
            '-addr',
            addr,
            '-c',
            String(conc),
            '-d',
            `${sec}s`,
            '-warmup',
            `${warm}s`,
          ],
          { stdio: ['ignore', 'pipe', 'inherit'] }
        )
        let s = ''
        c.stdout.on('data', (d) => (s += d))
        c.once('exit', (code) =>
          code === 0
            ? resolve(JSON.parse(s))
            : reject(new Error('client failed'))
        )
      })
      server.stdin.end()
      await exited
      const row = {
        round,
        conc,
        variant,
        worker: stats.address,
        rps: Math.round(out.rps),
        p50_us: Math.round(out.p50_us),
        p99_us: Math.round(out.p99_us),
        node_cpu_us: +(stats.cpu / stats.n).toFixed(1),
      }
      rows.push(row)
      console.error(JSON.stringify(row))
    }
  }
}
fs.mkdirSync(path.join(here, '../results'), { recursive: true })
fs.writeFileSync(
  path.join(here, `../results/native-route-${label}.json`),
  JSON.stringify(rows, null, 2)
)
