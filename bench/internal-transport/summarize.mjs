// node summarize.mjs <prefix>   e.g. linux  (reads results/<prefix>-r*.json)
// Prints the median of each cell across rounds, with the min–max range of
// the server's and client's CPU per request.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const prefix = process.argv[2]
const dir = path.join(here, 'results')
const rounds = fs
  .readdirSync(dir)
  .filter((f) => f.startsWith(`${prefix}-r`) && f.endsWith('.json'))
  .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).results)

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length % 2
    ? s[(s.length - 1) / 2]
    : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}
const cell = (xs) =>
  `${median(xs).toFixed(1)} (${Math.min(...xs).toFixed(1)}–${Math.max(...xs).toFixed(1)})`

console.log(`${rounds.length} rounds\n`)
console.log(
  '| direction | body | conc | proto | net | req/s | p50 µs | client CPU µs/req | server CPU µs/req |'
)
console.log('|' + ' --- |'.repeat(9))
const key = (r) => `${r.direction}|${r.size}|${r.conc}|${r.proto}|${r.network}`
for (const r of rounds[0]) {
  const same = rounds.map((rs) => rs.find((x) => key(x) === key(r)))
  console.log(
    `| ${r.direction} | ${r.size} | ${r.conc} | ${r.proto} | ${r.network} | ${Math.round(median(same.map((x) => x.rps)))} | ${Math.round(median(same.map((x) => x.p50_us)))} | ${cell(same.map((x) => x.client_cpu_us))} | ${cell(same.map((x) => x.server_cpu_us))} |`
  )
}
