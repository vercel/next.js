#!/usr/bin/env node
// Post-hoc (re-)analysis of runs at the boot level. Reads ONLY the
// results db: a run-dir argument is imported (idempotently) and
// verified first, a bare run id analyzes what the db already holds.
//   node bench-analyze.mjs <runDir|runId> [--base <arm>] [--cand <arm>]
import fs from 'node:fs'
import path from 'node:path'
import { analyzeE2eRows } from './bench-stats.mjs'
import { openDb, importRun, loadRows, runMeta, verify } from './bench-db.mjs'

const argv = process.argv.slice(2)
const target = argv.find((a) => !a.startsWith('--'))
const get = (name) => {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : undefined
}
if (!target) {
  console.error(
    'usage: node bench-analyze.mjs <runDir|runId> [--base arm] [--cand arm]'
  )
  process.exit(1)
}
const db = openDb()
let runId
if (fs.existsSync(target)) {
  runId = importRun(db, target).runId
} else {
  runId = path.basename(target)
}
const { failures, notes } = verify(db, runId)
for (const n of notes) console.log(`note: ${n}`)
if (failures.length) {
  console.error(`RESULTS DB VERIFY FAILED:\n  ${failures.join('\n  ')}`)
  process.exit(1)
}
const rows = loadRows(db, runId)
const arms = [...new Set(rows.map((r) => r.arm))]
if (arms.length !== 2) {
  console.error(`expected exactly 2 arms, found: ${arms.join(', ')}`)
  process.exit(1)
}
// Which arm is base? Row order cannot answer this (ABBA runs the
// candidate first), so require an explicit source: the run's meta,
// a conventional name, or the --base flag.
const meta = runMeta(db, runId)?.meta
const base =
  get('--base') ??
  (meta && arms.includes(meta.base) ? meta.base : undefined) ??
  ['base', 'synced'].find((n) => arms.includes(n))
if (!base) {
  console.error(
    `cannot determine the base arm from {${arms.join(', ')}}: ` +
      'no meta, no arm named "base"/"synced" — pass --base <arm>'
  )
  process.exit(1)
}
const cand = get('--cand') ?? arms.find((a) => a !== base)
const boots = new Set(rows.map((r) => r.vm)).size
console.log(`${runId}  boots=${boots}  arms: ${base} (base) vs ${cand}`)
if (meta?.pr)
  console.log(
    `PR: ${meta.pr.title ? `"${meta.pr.title}" — ` : ''}${meta.pr.url}`
  )
for (const a of meta?.arms ?? [])
  if (a.title) console.log(`  ${a.name}: "${a.title}"`)
if (rows[0].route === '') {
  // Micro (sandbox-ab) samples: phase holds the payload name.
  analyzeE2eRows(rows, base, cand, ['mean', 'p50', 'p95', 'p99', 'gcMs'])
} else {
  // No p99 for e2e: the load phases are far too small for it.
  analyzeE2eRows(rows, base, cand, [
    'rps',
    'median',
    'mean',
    'p95',
    'ttfb',
    'docKb',
    'gzipKb',
    'flightKb',
    'rss',
    'rssHw',
  ])
}
