#!/usr/bin/env node
// Correctness gate for React arms before spending bench compute: each
// arm gets a sandbox VM booted from the shared react build-env snapshot
// (created lazily if missing), extracts the arm's tree over the
// snapshot's node_modules, and runs the jest suite in prod mode (the
// channel the bench measures).
// A bench number from an arm that fails its tests is meaningless —
// always gate hand-assembled or conflict-resolved arms.
//
// Usage: node sandbox-gate.mjs --arms name=ref[,name=ref...]
//        [--pattern <jest pattern>, default: full suite] [--extra "yarn flow dom-node"]
//        [--snapshot snap_x] [--dry-run]
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadConfig, sandboxScope, ensureReactRepo } from './config.mjs'
import { runDetached, ensureReactBuildSnapshot } from './bench-common.mjs'

const execFileP = promisify(execFile)
const DRY_RUN = process.argv.includes('--dry-run')
const CONFIG = loadConfig({ requireScope: !DRY_RUN })
const REACT = ensureReactRepo(CONFIG)
const VERCEL = CONFIG.vercelBin
const SCOPE = CONFIG.team ? sandboxScope(CONFIG) : []

function parseArgs() {
  const args = { arms: [], snapshot: undefined, extra: [], pattern: '' }
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--arms') {
      for (const spec of argv[++i].split(',')) {
        const [name, ref] = spec.split('=')
        if (!name || !ref) throw new Error(`bad arm spec: ${spec}`)
        args.arms.push({ name, ref })
      }
    } else if (argv[i] === '--snapshot') {
      args.snapshot = argv[++i]
    } else if (argv[i] === '--extra') {
      // Extra gate command(s) run in the repo root after the jest gates,
      // e.g. --extra "yarn flow dom-node".
      args.extra.push(argv[++i])
    } else if (argv[i] === '--pattern') {
      args.pattern = argv[++i]
    } else if (argv[i] === '--dry-run') {
      // handled globally
    } else {
      throw new Error(`unknown arg: ${argv[i]}`)
    }
  }
  if (args.arms.length === 0) throw new Error('need --arms name=ref[,...]')
  if (args.pattern !== '' && !/^[A-Za-z0-9|_.-]+$/.test(args.pattern)) {
    // The pattern is interpolated into the remote command line; reject
    // anything that could smuggle extra jest flags (--passWithNoTests
    // would turn an empty selection into a PASS).
    throw new Error(
      `--pattern must match [A-Za-z0-9|_.-]+, got: ${args.pattern}`
    )
  }
  return args
}

async function sb(args, opts = {}) {
  const scoped = ['sandbox', ...args]
  const sep = scoped.indexOf('--')
  scoped.splice(sep < 0 ? scoped.length : sep, 0, ...SCOPE)
  const { stdout, stderr } = await execFileP(VERCEL, scoped, {
    maxBuffer: 64 * 1024 * 1024,
    ...opts,
  })
  // The CLI prints some results (e.g. snapshot ids) on stderr; callers
  // that parse exact values (size checks) must keep stdout-only.
  return opts.withStderr ? `${stdout}\n${stderr}` : stdout
}

async function git(args) {
  const { stdout } = await execFileP('git', ['-C', REACT, ...args], {
    maxBuffer: 256 * 1024 * 1024,
  })
  return stdout.trim()
}

async function rmVm(name) {
  try {
    await sb(['rm', name])
  } catch (e) {
    process.stderr.write(`warning: could not remove ${name}: ${e.message}\n`)
  }
}

async function gateArm(arm, snapshot, tmp, extra = [], pattern = '') {
  const sha = await git(['rev-parse', arm.ref])
  const short = sha.slice(0, 12)
  const vm = `sbench-gate-${arm.name}-${Date.now().toString(36)}`
  process.stderr.write(`[${arm.name}] vm ${vm} gating ${short}\n`)
  try {
    await sb([
      'create',
      '--name',
      vm,
      '--snapshot',
      snapshot,
      '--vcpus',
      '16',
      '--timeout',
      '2h',
      '--non-persistent',
      '--network-policy',
      'allow-all',
      '--tag',
      'purpose=sandbox-bench',
      '--silent',
    ])
  } catch (e) {
    if (!/vcpu/i.test(e.message)) throw e
    await sb([
      'create',
      '--name',
      vm,
      '--snapshot',
      snapshot,
      '--vcpus',
      '8',
      '--timeout',
      '2h',
      '--non-persistent',
      '--network-policy',
      'allow-all',
      '--tag',
      'purpose=sandbox-bench',
      '--silent',
    ])
  }
  try {
    const src = path.join(tmp, `gate-src-${arm.name}.tgz`)
    await execFileP('bash', [
      '-c',
      `git -C ${REACT} archive ${sha} | gzip -1 > ${src}`,
    ])
    await sb(['cp', src, `${vm}:/vercel/sandbox/src.tgz`])
    const srcSize = fs.statSync(src).size
    fs.rmSync(src, { force: true })
    // sandbox cp can succeed on missing remote files: size-check remotely.
    const check = await sb([
      'exec',
      vm,
      '--timeout',
      '2m',
      '--',
      'bash',
      '-c',
      `stat -c %s /vercel/sandbox/src.tgz`,
    ])
    if (Number(check.trim()) !== srcSize) {
      throw new Error(
        `${arm.name}: uploaded src.tgz size ${check.trim()} != local ${srcSize}`
      )
    }
    await runDetached(
      vm,
      `gate:${arm.name}`,
      // pipefail: every gate command is piped through tail, which would
      // otherwise mask its exit status from set -e (debugged 2026-07-19:
      // a failing flow run still printed GATE PASS).
      `set -o pipefail\n` +
        `cd /vercel/sandbox/react\n` +
        `find . -mindepth 1 -maxdepth 1 ! -name node_modules -exec rm -rf {} +\n` +
        `tar -xzf ../src.tgz && rm -f ../src.tgz\n` +
        `echo "== ${arm.name} ${short} prod gate (${pattern || 'full suite'}) =="\n` +
        `yarn test --prod ${pattern} --ci 2>&1 | tail -40\n` +
        extra
          .map(
            (cmd) =>
              `echo "== ${arm.name} extra: ${cmd} =="\n${cmd} 2>&1 | tail -30\n`
          )
          .join('') +
        `echo "== ${arm.name} GATE PASS =="\n`,
      null,
      90
    )
    return { arm: arm.name, sha: short, pass: true }
  } finally {
    await rmVm(vm)
  }
}

// Build-env snapshot: node_modules installed + JDK for the closure
// compiler, keyed on yarn.lock. Created once per lockfile, reused by
// every later gate.
async function main() {
  const args = parseArgs()
  if (DRY_RUN) {
    console.log(
      `[dry-run] gate plan: ${args.arms.map((a) => `${a.name}=${a.ref}`).join(', ')}`
    )
    console.log(
      `[dry-run] per arm: 1 VM from react build-env snapshot (lazy-created), ` +
        `yarn test --prod ${args.pattern} --ci` +
        (args.extra.length ? `, extra: ${args.extra.join(' && ')}` : '')
    )
    console.log('[dry-run] PASS requires: verified test counts (pipefail on).')
    process.exit(0)
  }
  // Each arm gates against ITS OWN lockfile's environment: arms with
  // different yarn.locks must not share node_modules.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sandbox-gate-'))
  try {
    const results = await Promise.allSettled(
      args.arms.map(async (arm) => {
        const sha = await git(['rev-parse', arm.ref])
        const snapshot = args.snapshot ?? (await ensureReactBuildSnapshot(sha))
        return gateArm(arm, snapshot, tmp, args.extra, args.pattern)
      })
    )
    let failed = 0
    for (let i = 0; i < results.length; i++) {
      const r = results[i]
      if (r.status === 'fulfilled') {
        console.log(`GATE ${args.arms[i].name}: PASS (${r.value.sha})`)
        console.log(
          `  bench this exact sha: --arms cand=${r.value.sha} (a ref can move between gate and bench)`
        )
      } else {
        failed++
        console.log(
          `GATE ${args.arms[i].name}: FAIL — ${r.reason.message.slice(0, 2500)}`
        )
      }
    }
    process.exit(failed ? 1 : 0)
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
