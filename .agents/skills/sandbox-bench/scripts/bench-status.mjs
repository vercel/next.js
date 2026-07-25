#!/usr/bin/env node
// Usage: node bench-status.mjs [--all]
//
// The only reliable way to know what's in flight. Session restarts silently
// kill background launchers while their detached VMs keep measuring, and a
// dead launcher's log file still ends with a healthy-looking progress line —
// never infer liveness from log tails. This reads each run's status.json,
// checks whether the recorded launcher pid is alive, and prints the recovery
// action per run.
import fs from 'fs'
import path from 'path'
import { loadConfig } from './config.mjs'

const CONFIG = loadConfig({ requireScope: false })
const E2E = path.join(CONFIG.cacheDir, 'e2e')
const all = process.argv.includes('--all')

const dirs = fs.existsSync(E2E)
  ? fs
      .readdirSync(E2E)
      .filter((d) => d.startsWith('run-'))
      .map((d) => path.join(E2E, d))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
  : []

const DAY = 24 * 3600 * 1000
let shown = 0
for (const dir of dirs) {
  const sf = path.join(dir, 'status.json')
  if (!fs.existsSync(sf)) continue
  let st
  try {
    st = JSON.parse(fs.readFileSync(sf, 'utf8'))
  } catch {
    continue
  }
  const fresh = fs.statSync(sf).mtimeMs > Date.now() - DAY
  let alive = false
  if (st.pid) {
    try {
      process.kill(st.pid, 0)
      alive = true
    } catch {}
  }
  if (!all && !fresh && !alive) {
    continue
  }
  const ageMin = st.updatedAt
    ? Math.round((Date.now() - new Date(st.updatedAt).getTime()) / 60000)
    : null
  const vms = Object.values(st.vms || {})
  const rows = vms.reduce((s, v) => s + (v.rows || 0), 0)

  let action
  if (st.phase === 'done') {
    action = 'complete — bench-analyze.mjs re-reads it any time'
  } else if (alive) {
    action = 'RUNNING — leave it alone'
  } else if (
    (rows > 0 || st.phase === 'measuring') &&
    ageMin !== null &&
    ageMin > 290
  ) {
    action =
      'DEAD and its VMs have expired — whatever was collected is in the ' +
      'run dir/results db; relaunch if more data is needed'
  } else if (rows > 0 || st.phase === 'measuring') {
    action =
      `DEAD but VMs may still hold data — node scripts/bench-collect.mjs ${dir}` +
      ' (measurement VMs time out ~5h after launch; collect before that)'
  } else {
    action =
      'DEAD before measurement — safe to relaunch (caches make it cheap); ' +
      'check for leaked builder VMs with sandbox-sweep.mjs'
  }

  console.log(
    `${path.basename(dir)}\n` +
      `  phase=${st.phase}` +
      (st.error
        ? ` error=${JSON.stringify(String(st.error).slice(0, 140))}`
        : '') +
      ` pid=${st.pid ?? '?'}(${alive ? 'alive' : 'dead'})` +
      (ageMin !== null ? ` updated=${ageMin}m ago` : '') +
      ` rows=${rows}${st.rowsExpected ? `/${st.rowsExpected}` : ''}\n` +
      `  -> ${action}`
  )
  shown++
}
if (!shown) {
  console.log('no recent runs (use --all to list everything)')
}
