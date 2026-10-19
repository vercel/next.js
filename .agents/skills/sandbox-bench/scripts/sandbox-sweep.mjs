// List/remove leaked bench sandboxes. Every VM the skill's scripts
// create is named sbench-* and tagged purpose=sandbox-bench; the
// harnesses remove their VMs in finally blocks, but a killed local
// process leaks them until their timeout.
//
// The project may be shared, so removal is deliberately conservative:
// a VM is only listed when its name matches, its tag matches, AND it is
// older than --min-age-hours (default 3 — longer than any healthy run),
// and removal is per exact listed name.
//
//   node sandbox-sweep.mjs                     # list what would be removed
//   node sandbox-sweep.mjs --yes               # remove
//   node sandbox-sweep.mjs --min-age-hours 0   # include fresh VMs (danger:
//                                              # only when nothing is active)
import { execFile } from 'child_process'
import { promisify } from 'util'
import { loadConfig, sandboxScope } from './config.mjs'

const execFileP = promisify(execFile)
const CONFIG = loadConfig()
const SCOPE = sandboxScope(CONFIG)
const argv = process.argv.slice(2)
const minAgeHours = argv.includes('--min-age-hours')
  ? Number(argv[argv.indexOf('--min-age-hours') + 1])
  : 3

// Age from the CLI's "CREATED" column ("32 minutes ago", "2 hours ago").
function ageHours(words) {
  const i = words.findIndex((w) => w === 'ago')
  if (i < 2) return Infinity
  const n = Number(words[i - 2])
  const unit = words[i - 1]
  if (!Number.isFinite(n)) return Infinity
  if (unit.startsWith('second')) return n / 3600
  if (unit.startsWith('minute')) return n / 60
  if (unit.startsWith('hour')) return n
  return n * 24
}

// Paginate: the CLI prints a cursor hint line when more pages exist.
const found = []
let cursor
for (let page = 0; page < 50; page++) {
  const args = ['sandbox', 'list', '--limit', '100', ...SCOPE]
  if (cursor) args.push('--cursor', cursor)
  const { stdout, stderr } = await execFileP(CONFIG.vercelBin, args, {
    maxBuffer: 1 << 24,
  })
  for (const line of stdout.split('\n')) {
    const words = line.trim().split(/\s+/)
    const name = words[0]
    if (!/^sbench-/.test(name)) continue
    if (!line.includes('purpose:sandbox-bench')) continue
    const age = ageHours(words)
    if (age < minAgeHours) {
      console.log(
        `skipping ${name} (${age.toFixed(1)}h old < --min-age-hours ${minAgeHours})`
      )
      continue
    }
    found.push(name)
  }
  cursor = `${stdout}\n${stderr}`.match(/--cursor\s+(\S+)/)?.[1]
  if (!cursor) break
}

if (!found.length) {
  console.log('no leaked bench sandboxes found')
  process.exit(0)
}
const doIt = argv.includes('--yes')
let failures = 0
for (const name of found) {
  if (doIt) {
    try {
      await execFileP(CONFIG.vercelBin, ['sandbox', 'rm', name, ...SCOPE])
      console.log(`removed ${name}`)
    } catch (e) {
      failures++
      console.error(`could not remove ${name}: ${e.message.split('\n')[0]}`)
    }
  } else {
    console.log(`would remove ${name} (pass --yes)`)
  }
}
process.exit(failures ? 1 : 0)
