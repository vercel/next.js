#!/usr/bin/env node
// Recover a run whose local launcher died (session teardown, crash):
// the remote VMs keep executing their detached loops regardless, so the
// data is usually still there. Reads the run's status.json for the VM
// names, waits for each VM's loop to finish, downloads its results,
// removes the VM, and runs the boot-level analysis.
//
//   node bench-collect.mjs <runDir> [--deadline-min 280]
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs'
import path from 'node:path'
import { loadConfig, sandboxScope } from './config.mjs'

const execFileP = promisify(execFile)
const CONFIG = loadConfig()
const SCOPE = sandboxScope(CONFIG)
const argv = process.argv.slice(2)
const dir = argv.find((a) => !a.startsWith('--'))
const deadlineMin = argv.includes('--deadline-min')
  ? Number(argv[argv.indexOf('--deadline-min') + 1])
  : 280
if (!dir || !fs.existsSync(path.join(dir, 'status.json'))) {
  console.error('usage: node bench-collect.mjs <runDir with status.json>')
  process.exit(1)
}
const statusPath = path.join(dir, 'status.json')
const st = JSON.parse(fs.readFileSync(statusPath, 'utf8'))
const vms = Object.keys(st.vms ?? {})
function writeStatus(patch) {
  Object.assign(st, patch, { updatedAt: new Date().toISOString() })
  fs.writeFileSync(statusPath, JSON.stringify(st, null, 2))
}
writeStatus({ phase: 'collecting (recovery)', pid: process.pid })
if (vms.length === 0) {
  console.error(
    'status.json lists no VMs — the run died before measurement; nothing to collect. ' +
      'Check for a leaked snapshot builder with sandbox-sweep.mjs and relaunch the run.'
  )
  process.exit(1)
}

async function sb(args) {
  const scoped = ['sandbox', ...args]
  const sep = scoped.indexOf('--')
  scoped.splice(sep < 0 ? scoped.length : sep, 0, ...SCOPE)
  const { stdout } = await execFileP(CONFIG.vercelBin, scoped, {
    maxBuffer: 1 << 26,
  })
  return stdout
}

const pending = new Map(vms.map((vm, i) => [vm, i]))
const collected = []
const deadline = Date.now() + deadlineMin * 60000
while (pending.size > 0 && Date.now() < deadline) {
  for (const [vm, idx] of [...pending]) {
    let out
    try {
      out = await sb([
        'exec',
        vm,
        '--timeout',
        '2m',
        '--',
        'bash',
        '-c',
        'cat /vercel/sandbox/loop.done 2>/dev/null || echo RUNNING',
      ])
    } catch (e) {
      // VM gone (timed out or removed): its data is lost; say so and move on.
      console.error(
        `${vm}: unreachable (${e.message.split('\n')[0].slice(0, 100)}) — boot lost`
      )
      st.vms[vm] = { ...st.vms[vm], state: 'lost' }
      writeStatus({})
      pending.delete(vm)
      continue
    }
    const state = out.trim().split('\n').pop()
    if (state === 'RUNNING') continue
    if (state === 'LOOPOK') {
      const local = path.join(dir, `results-vm${idx}.jsonl`)
      await sb(['cp', `${vm}:/vercel/sandbox/results.jsonl`, local])
      if (fs.existsSync(local) && fs.statSync(local).size > 500) {
        collected.push(local)
        st.vms[vm] = { ...st.vms[vm], state: 'done' }
        writeStatus({})
        console.error(`${vm}: collected -> ${local}`)
      } else {
        console.error(`${vm}: results too small; keeping VM for inspection`)
        pending.delete(vm)
        continue
      }
    } else {
      const tail = await sb([
        'exec',
        vm,
        '--timeout',
        '2m',
        '--',
        'bash',
        '-c',
        'tail -c 1500 /vercel/sandbox/loop.log',
      ])
      console.error(`${vm}: loop ended ${state}; log tail:\n${tail}`)
    }
    try {
      await sb(['rm', vm])
      console.error(`${vm}: removed`)
    } catch (e) {
      console.error(
        `${vm}: rm failed: ${e.message.split('\n')[0].slice(0, 100)}`
      )
    }
    pending.delete(vm)
  }
  if (pending.size > 0) await new Promise((r) => setTimeout(r, 60000))
}
for (const [vm] of pending)
  console.error(`${vm}: deadline exceeded, left running`)

if (collected.length === 0) {
  console.error('nothing collected')
  process.exit(1)
}
writeStatus({
  phase: `done (recovered ${collected.length}/${vms.length} boots)`,
})
console.log(`\ncollected ${collected.length}/${vms.length} boots; analysis:`)
const { stdout } = await execFileP(
  'node',
  [
    path.join(
      path.dirname(new URL(import.meta.url).pathname),
      'bench-analyze.mjs'
    ),
    dir,
  ],
  { maxBuffer: 1 << 24 }
)
console.log(stdout)
