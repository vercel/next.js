// Remote Next.js e2e A/B on Vercel Sandbox: blocks x arms x runs of
// bench:render-pipeline, both arms always in the SAME VM, paired per
// (block, run), ABBA order. The VM boot is the unit of replication;
// see bench-stats.mjs.
//
// Arms vary React (--pr / --arms, Next side fixed) or Next
// (--next-pr / --next-arms, React side fixed). The Next side defaults
// to canary. Refs resolve in configured/auto-cloned clones of the two
// repos (config.mjs); branch and tag names resolve against the remote.
//
// Usage:
//   node sandbox-e2e.mjs --pr <react pr url|num> [--vms 16] [--label x]
//   node sandbox-e2e.mjs --arms base=<ref>,cand=<ref> [--next-ref canary]
//   node sandbox-e2e.mjs --next-pr <next pr url|num> [--react-ref main]
//   node sandbox-e2e.mjs --next-arms base=<ref>,cand=<ref> [--react-ref main]
//   Common: [--blocks 1] [--runs 2] [--vms 16] [--routes /blog,/dashboard,/docs]
//     [--warmup 200] [--serial 800] [--load-requests 8] [--load-concurrency 8]
//     [--isolate-routes] [--bench-env K=V] [--profile] [--keep] [--dry-run]
import { execFile, spawn } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import { analyzeE2eRows, tTestP } from './bench-stats.mjs'
import { openDb, importRun, loadRows, verify as verifyDb } from './bench-db.mjs'
import {
  loadConfig,
  sandboxScope,
  ensureNextRepo,
  ensureReactRepo,
} from './config.mjs'

const execFileP = promisify(execFile)

const DRY_RUN = process.argv.includes('--dry-run')
const CONFIG = loadConfig({ requireScope: !DRY_RUN })
// Clones happen on first use: the react one only when a react ref is
// benched or pinned (pure Next A/B uses each ref's vendored React).
let nextRepoResolved
function NEXT_REPO_LAZY() {
  if (!nextRepoResolved) nextRepoResolved = ensureNextRepo(CONFIG)
  return nextRepoResolved
}
let reactRepoResolved
function REACT_REPO_LAZY() {
  if (!reactRepoResolved) reactRepoResolved = ensureReactRepo(CONFIG)
  return reactRepoResolved
}
const VERCEL = CONFIG.vercelBin
const SCOPE = CONFIG.team ? sandboxScope(CONFIG) : []
const CACHE = path.join(CONFIG.cacheDir, 'e2e')
const REACT_SNAP_CACHE = path.join(CONFIG.cacheDir, 'react-snap')
const SETUP_VERSION = 'v1-al2023-node24-jdk21'
// Targets build-all-release-channels needs for a sync-react-able arm
// (both channels, oss-stable + oss-experimental).
const E2E_BUILD_TARGETS =
  'react/,react.react-server,react-dom/,react-dom.,react-dom-server,scheduler/,react-is,react-server-dom-turbopack,react-server-dom-webpack'
// owner/repo for CI-artifact lookup, from the configured clone URL.
const REACT_GH_REPO =
  CONFIG.reactRepoUrl.match(/github\.com[:/]+([^/]+\/[^/.]+)/)?.[1] ??
  'react/react'
const NEXT_GH_REPO =
  CONFIG.nextRepoUrl.match(/github\.com[:/]+([^/]+\/.+?)(?:\.git)?$/)?.[1] ??
  'vercel/next.js'
// Runtime provenance: the compiled server files prod app-page runtimes
// are bundled from — BOTH bundlers, so changes touching only one still
// move the fingerprint.
const FP_FILES = [
  'packages/next/dist/compiled/react-server-dom-turbopack-experimental/cjs/react-server-dom-turbopack-server.node.production.js',
  'packages/next/dist/compiled/react-server-dom-webpack-experimental/cjs/react-server-dom-webpack-server.node.production.js',
]

function parseArgs() {
  const a = process.argv.slice(2)
  const get = (name, dflt) => {
    const i = a.indexOf(name)
    return i >= 0 ? a[i + 1] : dflt
  }
  // React arms: name=<git ref in the react repo> (built remotely, cached
  // by sha). Next arms: name=<git ref in this checkout>. Exactly one of
  // the two sides varies; the other is fixed for both arms.
  const parseArmSpec = (spec, flag) =>
    spec
      .split(',')
      .filter(Boolean)
      .map((s) => {
        const [name, src] = s.split('=')
        if (!name || !src)
          throw new Error(`bad arm "${s}" in ${flag}, want name=<ref>`)
        return { name, ref: src }
      })
  const arms = parseArmSpec(get('--arms', ''), '--arms')
  const nextArms = parseArmSpec(get('--next-arms', ''), '--next-arms')
  const pr = get('--pr', undefined)
  const nextPr = get('--next-pr', undefined)
  const reactModes = (arms.length ? 1 : 0) + (pr ? 1 : 0)
  const nextModes = (nextArms.length ? 1 : 0) + (nextPr ? 1 : 0)
  if (reactModes + nextModes !== 1) {
    throw new Error('need exactly one of: --pr, --arms, --next-pr, --next-arms')
  }
  // One react arm = "vs what this Next ships": base derived as
  // merge-base(cand, react synced into the Next ref).
  if (arms.length > 2)
    throw new Error(
      '--arms takes one arm (vs synced react) or two (base first)'
    )
  if (nextArms.length && nextArms.length !== 2)
    throw new Error('--next-arms needs exactly two arms (base first)')
  return {
    arms,
    nextArms,
    pr,
    nextPr,
    dryRun: a.includes('--dry-run'),
    allowUngated: a.includes('--allow-ungated'),
    // Fixed sides. Next defaults to canary.
    nextRef: get('--next-ref', 'canary'),
    // For Next A/B the React side defaults to whatever each Next ref
    // vendors (that's what would ship); --react-ref pins both arms to
    // one React build instead.
    reactRef: get('--react-ref', ''),
    // The VM boot is the unit of replication (see bench-stats.mjs):
    // allocate toward more boots with fewer runs each.
    blocks: Number(get('--blocks', '1')),
    runs: Number(get('--runs', '2')),
    vms: Number(get('--vms', '16')),
    routes: get('--routes', '/blog,/dashboard,/docs'),
    warmup: Number(get('--warmup', '200')),
    serial: Number(get('--serial', '800')),
    loadRequests: Number(get('--load-requests', '8')),
    loadConcurrency: Number(get('--load-concurrency', '8')),
    isolateRoutes: a.includes('--isolate-routes'),
    keep: a.includes('--keep'),
    prepare: a.includes('--prepare'),
    // Profiles are captured by default: the pass runs strictly after the
    // timed runs (never touches the numbers), costs ~10-15 min of VM
    // wall-clock, and cross-VM profile diffs proved highly stable
    // (16/16 sign agreement on movers). --no-profile opts out.
    profile: !a.includes('--no-profile'),
    // KEY=VALUE env exported around bench:render-pipeline (e.g.
    // NEXT_FLIGHT_RENDER=0 to force the byte-tee SSR baseline).
    benchEnv: get('--bench-env', ''),
    label: get('--label', 'e2e'),
  }
}

// Recovery record for bench-collect.mjs: if this launcher dies, the
// remote VMs keep executing their detached loops, and this file names
// them so the results can still be collected.
let statusFile = null
let statusState = {}
function writeStatus(patch) {
  if (!statusFile) return
  statusState = {
    ...statusState,
    ...patch,
    updatedAt: new Date().toISOString(),
  }
  try {
    fs.writeFileSync(statusFile, JSON.stringify(statusState, null, 2))
  } catch {}
}

async function sb(args, opts = {}) {
  const scoped = ['sandbox', ...args]
  const sep = scoped.indexOf('--')
  scoped.splice(sep < 0 ? scoped.length : sep, 0, ...SCOPE)
  const { stdout, stderr } = await execFileP(VERCEL, scoped, {
    maxBuffer: 64 * 1024 * 1024,
    ...opts,
  })
  // The CLI prints some results (e.g. snapshot ids) on stderr.
  return `${stdout}\n${stderr}`
}

// The platform rejects single `sandbox cp` uploads somewhere above ~128MB
// ("Request Entity Too Large", observed 2026-07-20; 645MB tree tarballs that
// uploaded fine hours earlier started failing). Upload large files in parts
// and reassemble on the VM, verifying the sha256 end to end.
const CP_CHUNK_BYTES = 128 * 1024 * 1024
async function sbCpToVm(vm, localPath, vmDest) {
  const size = fs.statSync(localPath).size
  if (size <= CP_CHUNK_BYTES) {
    await sb(['cp', localPath, `${vm}:${vmDest}`])
    return
  }
  const partDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sbcp-'))
  try {
    await execFileP('split', [
      '-b',
      String(CP_CHUNK_BYTES),
      localPath,
      path.join(partDir, 'part-'),
    ])
    const parts = fs.readdirSync(partDir).sort()
    for (const p of parts) {
      await sb(['cp', path.join(partDir, p), `${vm}:${vmDest}.${p}`])
    }
    const localSha = (
      await execFileP('shasum', ['-a', '256', localPath])
    ).stdout.split(' ')[0]
    const catList = parts.map((p) => `'${vmDest}.${p}'`).join(' ')
    const out = await sbExec(
      vm,
      '10m',
      `cat ${catList} > '${vmDest}' && rm -f ${catList} && sha256sum '${vmDest}' | cut -d' ' -f1`,
      `cp:${path.basename(vmDest)}`
    )
    // sbExec output interleaves stderr (CLI banners); take the last
    // sha-shaped token rather than the last line.
    const shaTokens = out.match(/\b[0-9a-f]{64}\b/g)
    const remoteSha = shaTokens ? shaTokens[shaTokens.length - 1] : ''
    if (remoteSha !== localSha) {
      throw new Error(
        `chunked upload of ${localPath} corrupt: local ${localSha} != remote ${remoteSha}`
      )
    }
  } finally {
    fs.rmSync(partDir, { recursive: true, force: true })
  }
}

// PR spec ("37023" or a github PR URL) -> arms: base = merge-base of the
// PR head with upstream main, cand = PR head. Fetched into local refs so
// git archive / yarn.lock reads work as for any other sha.
async function resolvePrArms(pr, repo, repoUrl, defaultBranch) {
  const num = String(pr).match(/(\d+)\/?$/)?.[1]
  if (!num) throw new Error(`cannot parse PR number from "${pr}"`)
  console.error(`fetching ${repoUrl} PR #${num} + ${defaultBranch}...`)
  // The clone is shared: concurrent launchers fetching the same ref
  // race the ref lock. Namespace the temp refs by pid and retry the
  // fetch (pack files still contend occasionally).
  const ns = `refs/bench-tmp/${process.pid}`
  for (let attempt = 1; ; attempt++) {
    try {
      await execFileP('git', [
        '-C',
        repo,
        'fetch',
        '-q',
        repoUrl,
        `+refs/pull/${num}/head:${ns}/pr-${num}`,
        `+refs/heads/${defaultBranch}:${ns}/upstream-${defaultBranch}`,
      ])
      break
    } catch (e) {
      if (attempt >= 3) throw e
      console.error(
        `fetch attempt ${attempt} failed (${e.message.split('\n')[0].slice(0, 80)}); retrying...`
      )
      await new Promise((r) =>
        setTimeout(r, 5000 * attempt + Math.random() * 5000)
      )
    }
  }
  const cand = (
    await execFileP('git', ['-C', repo, 'rev-parse', `${ns}/pr-${num}`])
  ).stdout.trim()
  const base = (
    await execFileP('git', [
      '-C',
      repo,
      'merge-base',
      `${ns}/upstream-${defaultBranch}`,
      cand,
    ])
  ).stdout.trim()
  await execFileP('git', [
    '-C',
    repo,
    'update-ref',
    '-d',
    `${ns}/pr-${num}`,
  ]).catch(() => {})
  await execFileP('git', [
    '-C',
    repo,
    'update-ref',
    '-d',
    `${ns}/upstream-${defaultBranch}`,
  ]).catch(() => {})
  console.error(
    `PR #${num}: cand=${cand.slice(0, 12)} base=${base.slice(0, 12)} (merge-base with ${defaultBranch})`
  )
  return [
    { name: 'base', ref: base },
    { name: `pr${num}`, ref: cand },
  ]
}

// Normalize every mode into two arms of {name, ref (react), nextRef};
// exactly one side differs between the arms.
// Green CI on the react repo is the correctness gate for react arms: a
// perf number from a broken build is worse than no number. Local or
// unpushed refs have no CI — --allow-ungated skips the check, and
// sandbox-gate.mjs exists to gate such refs on a VM instead.
const ciVerdicts = new Map()
async function assertCiGreen(sha, armName, allowUngated) {
  if (!ciVerdicts.has(sha)) {
    let verdict
    try {
      const out = (
        await execFileP(
          'gh',
          [
            'api',
            '--paginate',
            `repos/${REACT_GH_REPO}/commits/${sha}/check-runs?per_page=100`,
            '--jq',
            '[.check_runs[] | {name, conclusion}]',
          ],
          { maxBuffer: 1 << 24 }
        )
      ).stdout
      const checks = out
        .trim()
        .split('\n')
        .filter(Boolean)
        .flatMap((page) => JSON.parse(page))
      if (checks.length === 0) {
        verdict = 'no CI runs found (unpushed or unbuilt commit)'
      } else if (checks.some((c) => c.conclusion === null)) {
        verdict = 'CI still running — retry when it finishes'
      } else {
        // Policy: all tests (including build), flow, and lint must be
        // green. DevTools suites and repo-infra jobs (artifact syncs,
        // cleanup, staleness) don't gate benching. Ignore-by-name, so
        // any NEW job blocks by default instead of being skipped.
        const IGNORED =
          /devtools|^cleanup$|^stale$|_artifacts$|^sizebot|^dependabot/i
        const relevant = checks.filter((c) => !IGNORED.test(c.name))
        const bad = relevant.filter(
          (c) =>
            c.conclusion !== 'success' &&
            c.conclusion !== 'neutral' &&
            c.conclusion !== 'skipped'
        )
        // Name the offenders: the human deciding whether to proceed
        // ungated needs to see what failed at a glance, not re-query CI.
        verdict =
          bad.length === 0
            ? 'green'
            : `CI not green (${bad.length}/${relevant.length} relevant checks): ` +
              [...new Set(bad.map((c) => `${c.name} (${c.conclusion})`))]
                .slice(0, 8)
                .join('; ')
      }
    } catch (e) {
      verdict = `could not query CI (${e.message.split('\n')[0].slice(0, 80)})`
    }
    ciVerdicts.set(sha, verdict)
  }
  const verdict = ciVerdicts.get(sha)
  if (verdict === 'green') {
    console.error(`arm ${armName}: react ${sha.slice(0, 12)} CI green`)
    return
  }
  if (allowUngated) {
    console.error(
      `arm ${armName}: react ${sha.slice(0, 12)} UNGATED (${verdict}) — proceeding per --allow-ungated`
    )
    return
  }
  throw new Error(
    `arm ${armName}: react ${sha.slice(0, 12)}: ${verdict}.\n` +
      'Benching an unverified build produces untrustworthy numbers. Either wait for/fix CI, ' +
      'gate the ref yourself (node sandbox-gate.mjs --arms ' +
      armName +
      '=<ref>), and then ' +
      're-run with --allow-ungated, or pass --allow-ungated if you accept the risk.'
  )
}

// The react commit a Next ref ships: sync-react records it in the root
// package.json ("react-builtin": "npm:react@19.x.y-canary-<sha>-<date>").
async function syncedReactSha(nextRef) {
  const pkg = (
    await execFileP(
      'git',
      ['-C', NEXT_REPO_LAZY(), 'show', `${nextRef}:package.json`],
      { maxBuffer: 1 << 24 }
    )
  ).stdout
  const m = JSON.parse(pkg).devDependencies?.['react-builtin']?.match(
    /-([0-9a-f]{8,40})-\d{8}$/
  )
  if (!m)
    throw new Error(
      `cannot parse synced react sha from ${nextRef}:package.json react-builtin`
    )
  return m[1]
}

// Next refs: shas and refs already fetched this run resolve locally;
// branch/tag names resolve against the remote. Each ref resolves once
// per run (memo) and everything downstream uses the sha, so the two
// arms always get the same tree. The clone is shared between
// concurrent launchers (pid-namespaced temp refs, fetch retried).
async function fetchNextRef(repo, spec, dst) {
  for (let attempt = 1; ; attempt++) {
    try {
      await execFileP('git', [
        '-C',
        repo,
        'fetch',
        '-q',
        CONFIG.nextRepoUrl,
        `+${spec}:${dst}`,
      ])
      return
    } catch (e) {
      if (attempt >= 3) throw e
      await new Promise((r) => setTimeout(r, 2000 * attempt))
    }
  }
}
const nextShaMemo = new Map()
async function nextShaFor(ref) {
  if (nextShaMemo.has(ref)) return nextShaMemo.get(ref)
  const repo = NEXT_REPO_LAZY()
  let sha
  if (/^[0-9a-f]{7,40}$/i.test(ref) || ref.startsWith('refs/')) {
    try {
      sha = (
        await execFileP('git', [
          '-C',
          repo,
          'rev-parse',
          '--verify',
          `${ref}^{commit}`,
        ])
      ).stdout.trim()
    } catch {}
  }
  if (!sha) {
    const dst = `refs/bench-tmp/${process.pid}/next-fixed-${nextShaMemo.size}`
    // "canary" means the latest published canary release, not the
    // branch head: postinstall downloads the @next/swc binary for
    // package.json's version, which only exists once that release is
    // on npm. Between releases this is also a stable sha, so built
    // snapshots stay warm until a new canary actually ships.
    let spec = ref
    let release
    if (ref === 'canary') {
      release = `v${(await execFileP('npm', ['view', 'next@canary', 'version'])).stdout.trim()}`
      spec = `refs/tags/${release}`
    }
    await fetchNextRef(repo, spec, dst)
    sha = (
      await execFileP('git', ['-C', repo, 'rev-parse', `${dst}^{commit}`])
    ).stdout.trim()
    console.error(
      `next ${ref}: ${release ? `${release} = ` : ''}${sha.slice(0, 12)}`
    )
  }
  nextShaMemo.set(ref, sha)
  return sha
}

async function resolveArms(cfg) {
  let arms
  if (cfg.pr) {
    arms = (
      await resolvePrArms(
        cfg.pr,
        REACT_REPO_LAZY(),
        CONFIG.reactRepoUrl,
        'main'
      )
    ).map((a) => ({ ...a, nextRef: cfg.nextRef }))
  } else if (cfg.arms.length === 1) {
    // Candidate react vs whatever this Next ref ships. merge-base keeps
    // the base a real commit in the candidate's history even when the
    // synced version isn't an exact ancestor.
    const synced = await syncedReactSha(await nextShaFor(cfg.nextRef))
    const repo = REACT_REPO_LAZY()
    const base = (
      await execFileP('git', [
        '-C',
        repo,
        'merge-base',
        synced,
        cfg.arms[0].ref,
      ])
    ).stdout.trim()
    console.error(
      `react base = merge-base(${cfg.arms[0].ref}, synced ${synced}) = ${base.slice(0, 12)}`
    )
    arms = [
      { name: 'synced', ref: base, nextRef: cfg.nextRef },
      { ...cfg.arms[0], nextRef: cfg.nextRef },
    ]
  } else if (cfg.arms.length) {
    arms = cfg.arms.map((a) => ({ ...a, nextRef: cfg.nextRef }))
  } else if (cfg.nextPr) {
    arms = (
      await resolvePrArms(
        cfg.nextPr,
        NEXT_REPO_LAZY(),
        CONFIG.nextRepoUrl,
        'canary'
      )
    ).map((a) => ({ name: a.name, ref: cfg.reactRef || null, nextRef: a.ref }))
  } else {
    arms = cfg.nextArms.map((a) => ({
      name: a.name,
      ref: cfg.reactRef || null,
      nextRef: a.ref,
    }))
  }
  for (const arm of arms) {
    arm.nextSha = await nextShaFor(arm.nextRef)
  }
  return arms
}

// Human context for reports: PR title/URL and the varying side's
// commit titles, recorded in meta.json and printed with the analysis
// so verdicts can link what was measured.
async function commitTitle(repo, ref) {
  try {
    return (
      await execFileP('git', ['-C', repo, 'log', '-1', '--format=%s', ref])
    ).stdout.trim()
  } catch {
    return undefined
  }
}
async function describeRun(cfg) {
  const reactVaries = !(cfg.nextPr || cfg.nextArms.length)
  let pr
  const num = String(cfg.pr ?? cfg.nextPr ?? '').match(/(\d+)\/?$/)?.[1]
  if (num) {
    const ghRepo = cfg.pr ? REACT_GH_REPO : NEXT_GH_REPO
    pr = { url: `https://github.com/${ghRepo}/pull/${num}` }
    try {
      pr.title = (
        await execFileP('gh', [
          'api',
          `repos/${ghRepo}/pulls/${num}`,
          '--jq',
          '.title',
        ])
      ).stdout.trim()
    } catch {}
  }
  const arms = []
  for (const a of cfg.arms) {
    arms.push({
      name: a.name,
      title: reactVaries
        ? await commitTitle(REACT_REPO_LAZY(), a.ref)
        : await commitTitle(NEXT_REPO_LAZY(), a.nextSha),
    })
  }
  return { pr, arms }
}
function printRunContext(out, d) {
  if (!d) return
  if (d.pr) out(`PR: ${d.pr.title ? `"${d.pr.title}" — ` : ''}${d.pr.url}`)
  for (const a of d.arms ?? []) if (a.title) out(`  ${a.name}: "${a.title}"`)
}

// Live running estimate, printed as pairs complete across all VMs.
const T95 = [
  12.71, 4.3, 3.18, 2.78, 2.57, 2.45, 2.36, 2.31, 2.26, 2.23, 2.2, 2.18, 2.16,
  2.14, 2.13,
]
function makeLive(baseName, metrics, keyOf) {
  const rows = []
  return (vm, row) => {
    rows.push({ vmIdx: vm, ...row })
    const key = keyOf(row)
    const other = rows.find(
      (r) =>
        r.vmIdx === vm &&
        keyOf(r) === key &&
        r.block === row.block &&
        r.run === row.run &&
        r.arm !== row.arm
    )
    if (!other) return
    const cands = rows.filter((r) => keyOf(r) === key && r.arm !== baseName)
    const parts = []
    let n = 0
    for (const metric of metrics) {
      const deltas = []
      for (const c of cands) {
        const b = rows.find(
          (r) =>
            r.vmIdx === c.vmIdx &&
            keyOf(r) === key &&
            r.block === c.block &&
            r.run === c.run &&
            r.arm === baseName
        )
        if (b && b[metric] > 0) deltas.push((c[metric] - b[metric]) / b[metric])
      }
      n = deltas.length
      if (n < 2) return
      const mean = deltas.reduce((a, b2) => a + b2, 0) / n
      const sd = Math.sqrt(
        deltas.reduce((a, b2) => a + (b2 - mean) ** 2, 0) / (n - 1)
      )
      const ci = ((T95[n - 2] ?? 2.0) * sd) / Math.sqrt(n)
      const p = pairedP(deltas)
      parts.push(
        `${metric} ${(mean * 100).toFixed(1)}%±${(ci * 100).toFixed(1)} p=${p.toFixed(3)}`
      )
    }
    console.error(`live ${key} n=${n}: ${parts.join('  ')}`)
  }
}

function sbExec(vm, timeout, script, tag, onRow) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      VERCEL,
      [
        'sandbox',
        'exec',
        vm,
        ...SCOPE,
        '--timeout',
        timeout,
        '--',
        'bash',
        '-c',
        script,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    )
    let out = ''
    let buf = ''
    child.stdout.on('data', (c) => {
      out += c
      buf += c
      const lines = buf.split('\n')
      buf = lines.pop()
      for (const l of lines) {
        if (!l) continue
        if (l.startsWith('ROW ') && onRow) {
          try {
            onRow(JSON.parse(l.slice(4)))
          } catch {}
        } else {
          process.stderr.write(`[${tag}] ${l}\n`)
        }
      }
    })
    child.stderr.on('data', (c) => {
      out += c
      process.stderr.write(
        String(c)
          .split('\n')
          .filter(Boolean)
          .map((l) => `[${tag}!] ${l}\n`)
          .join('')
      )
    })
    child.on('exit', (code) =>
      code === 0
        ? resolve(out)
        : reject(new Error(`${tag}: exit ${code}\n${out.slice(-2000)}`))
    )
  })
}

async function rmVm(name) {
  try {
    await sb(['rm', name])
  } catch (e) {
    process.stderr.write(`warning: could not remove ${name}: ${e.message}\n`)
  }
}

// Long-running remote work detached from the exec stream (streams drop
// flakily on multi-minute silences): nohup the script on the VM, then
// poll its log with short execs. Immune to transport hiccups.
async function runDetached(vm, tag, script, onLine, deadlineMin) {
  let transcript = ''
  const local = path.join(os.tmpdir(), `loop-${vm}.sh`)
  // EXIT trap, not ERR: the ERR trap does not fire for several failure
  // shapes (e.g. `cmd || (tail; exit 1)`), which left loop.done unwritten
  // and the poll waiting on heartbeats forever.
  fs.writeFileSync(
    local,
    `trap 'code=$?; if [ $code -eq 0 ]; then echo LOOPOK; else echo LOOPFAIL; fi > /vercel/sandbox/loop.done' EXIT\nset -e\n${script}\n`
  )
  await sb(['cp', local, `${vm}:/vercel/sandbox/loop.sh`])
  fs.rmSync(local, { force: true })
  await sb([
    'exec',
    vm,
    '--timeout',
    '2m',
    '--',
    'bash',
    '-c',
    'rm -f /vercel/sandbox/loop.done /vercel/sandbox/loop.log; nohup bash /vercel/sandbox/loop.sh >/vercel/sandbox/loop.log 2>&1 & echo kicked',
  ])
  let offset = 0
  let failures = 0
  const deadline = Date.now() + deadlineMin * 60_000
  while (true) {
    await new Promise((r) => setTimeout(r, 45_000))
    if (Date.now() > deadline)
      throw new Error(`${tag}: detached loop deadline exceeded`)
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
        `tail -c +${offset + 1} /vercel/sandbox/loop.log | head -c 200000; printf '\\n@@SIZE %s @@DONE %s\\n' "$(stat -c %s /vercel/sandbox/loop.log 2>/dev/null || echo 0)" "$(cat /vercel/sandbox/loop.done 2>/dev/null || echo no)"`,
      ])
      failures = 0
    } catch (e) {
      if (++failures >= 6)
        throw new Error(
          `${tag}: ${failures} consecutive poll failures: ${e.message.slice(0, 200)}`
        )
      continue
    }
    const m = out.match(/@@SIZE (\d+) @@DONE (\S+)/)
    const body = out.slice(0, out.lastIndexOf('\n@@SIZE'))
    transcript += body
    for (const l of body.split('\n')) {
      if (!l) continue
      if (l.startsWith('ROW ') && onLine) {
        try {
          onLine(JSON.parse(l.slice(4)))
        } catch {}
      } else {
        process.stderr.write(`[${tag}] ${l}\n`)
      }
    }
    if (m) {
      offset = Math.min(Number(m[1]), offset + 200000)
      if (m[2] === 'LOOPOK') return transcript
      if (m[2] === 'LOOPFAIL')
        throw new Error(
          `${tag}: remote loop failed; tail:\n${body.slice(-1500)}`
        )
    }
  }
}

// ------------------------------------------------------------ snapshots

async function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16)
}

async function snapshotIdFor(cacheDir, key) {
  const file = path.join(cacheDir, `snap-${key}`)
  if (!fs.existsSync(file)) return undefined
  const id = fs.readFileSync(file, 'utf8').trim()
  try {
    await sb(['snapshots', 'get', id])
    return id
  } catch {
    return undefined
  }
}

async function takeSnapshot(vm, cacheDir, key) {
  const out = await sb(['snapshot', vm, '--stop', '--expiration', '30d'])
  const id = out.match(/snap_[A-Za-z0-9]+/)?.[0]
  if (!id)
    throw new Error(`could not parse snapshot id from: ${out.slice(-500)}`)
  fs.mkdirSync(cacheDir, { recursive: true })
  fs.writeFileSync(path.join(cacheDir, `snap-${key}`), `${id}\n`)
  console.error(`snapshot ${id} cached (${key})`)
  return id
}

// React build environment (repo + node_modules + JDK), shared with
// sandbox-ab.mjs. Keyed on the arm's yarn.lock.
async function ensureReactBuildSnapshot(refSha) {
  const lock = await execFileP(
    'git',
    ['-C', REACT_REPO_LAZY(), 'show', `${refSha}:yarn.lock`],
    { maxBuffer: 1 << 28 }
  )
  const key = await sha256(SETUP_VERSION + lock.stdout)
  let id = await snapshotIdFor(REACT_SNAP_CACHE, key)
  if (id) return id
  const vm = `react-snap-build-${Date.now().toString(36)}`
  console.error(
    `creating react build-env snapshot (one-time for this yarn.lock)...`
  )
  await sb([
    'create',
    '--name',
    vm,
    '--runtime',
    'node24',
    '--vcpus',
    '8',
    '--timeout',
    '45m',
    '--non-persistent',
    '--network-policy',
    'allow-all',
    '--tag',
    'purpose=sandbox-bench',
    '--silent',
  ])
  try {
    const src = path.join(os.tmpdir(), `react-snap-src-${key}.tgz`)
    await execFileP('bash', [
      '-c',
      `git -C ${REACT_REPO_LAZY()} archive ${refSha} | gzip -1 > ${src}`,
    ])
    await sb(['cp', src, `${vm}:/vercel/sandbox/src.tgz`])
    fs.rmSync(src, { force: true })
    await sb([
      'exec',
      vm,
      '--timeout',
      '10m',
      '--sudo',
      '--',
      'dnf',
      'install',
      '-y',
      '-q',
      'java-21-amazon-corretto-headless',
    ])
    await sbExec(
      vm,
      '20m',
      `set -e; mkdir -p /vercel/sandbox/react && cd /vercel/sandbox/react && tar -xzf ../src.tgz && rm -f ../src.tgz && ` +
        `npm i -g yarn >/dev/null 2>&1 && yarn install --frozen-lockfile --ignore-engines >/dev/null 2>&1 && echo react env ready`,
      'react-snap'
    )
    return await takeSnapshot(vm, REACT_SNAP_CACHE, key)
  } finally {
    await rmVm(vm)
  }
}

// Experiment snapshot: both arms fully vendored + built as SEPARATE repo
// trees (/vercel/sandbox/next-<arm>), app .next included, so run VMs
// boot straight into measurement and arm switching is a cd. Keyed on
// (next ref, armA, armB); the app build happens once here, so every run
// VM measures byte-identical artifacts.
function armId(a) {
  return `${a.sha ? a.sha.slice(0, 12) : 'vendored'}+${a.nextSha.slice(0, 12)}`
}

async function ensureExperimentSnapshot(cfg) {
  // Arm NAMES are part of the key, not just shas: tree paths inside the
  // snapshot embed the names (/vercel/sandbox/next-<name>), so a snapshot
  // built for the same sha pair under different names has the wrong trees.
  const key = await sha256(
    SETUP_VERSION + 'exp3' + cfg.arms.map((a) => `${a.name}=${armId(a)}`).join()
  )
  let id = await snapshotIdFor(CACHE, key)
  if (id) return id
  // Built TREES are cached independently of the (pair, names) snapshot:
  // the base side of a comparison repeats across cells far more often
  // than the exact pair does, and a cached tree turns a ~15 min
  // install+build+sync into an upload+extract.
  for (const arm of cfg.arms) {
    arm.treeKey = await sha256(SETUP_VERSION + 'tree1' + armId(arm))
    arm.treeTgz = path.join(CACHE, `tree-${arm.treeKey}.tgz`)
    arm.treeCached = fs.existsSync(arm.treeTgz)
  }
  const vm = `sbench-expsnap-${Date.now().toString(36)}`
  console.error(
    `creating experiment snapshot (one-time for arms=${cfg.arms.map(armId).join(',')}; ` +
      `trees cached: ${
        cfg.arms
          .filter((a) => a.treeCached)
          .map((a) => a.name)
          .join(',') || 'none'
      })...`
  )
  try {
    await sb([
      'create',
      '--name',
      vm,
      '--runtime',
      'node24',
      '--vcpus',
      '16',
      '--timeout',
      '1h',
      '--non-persistent',
      '--network-policy',
      'allow-all',
      '--tag',
      'purpose=sandbox-bench',
      '--silent',
    ])
  } catch (e) {
    // Only a genuine capacity/plan rejection falls back to 8 vCPUs;
    // anything else (auth, quota, network) must surface as itself.
    if (!/vcpu/i.test(e.message)) throw e
    console.error('16 vCPUs unavailable, using 8')
    await sb([
      'create',
      '--name',
      vm,
      '--runtime',
      'node24',
      '--vcpus',
      '8',
      '--timeout',
      '1h',
      '--non-persistent',
      '--network-policy',
      'allow-all',
      '--tag',
      'purpose=sandbox-bench',
      '--silent',
    ])
  }
  try {
    for (const tgz of new Set(
      cfg.arms.filter((a) => !a.treeCached).map((a) => a.nextTgz)
    )) {
      await sb(['cp', tgz, `${vm}:/vercel/sandbox/${path.basename(tgz)}`])
    }
    for (const arm of cfg.arms) {
      if (arm.treeCached) {
        console.error(`uploading cached tree for ${arm.name}...`)
        await sbCpToVm(vm, arm.treeTgz, `/vercel/sandbox/tree-${arm.name}.tgz`)
      } else if (arm.tgz) {
        await sb(['cp', arm.tgz, `${vm}:/vercel/sandbox/arm-${arm.name}.tgz`])
      }
    }
    // Cached trees: extract. Missing trees: install sequentially (the
    // shared pnpm store dislikes concurrent cold installs), then build,
    // sync, and warm concurrently — the builds dominate and parallelize
    // across the 16 vCPUs. PHASE lines make the time budget visible.
    const extractCached = cfg.arms
      .filter((a) => a.treeCached)
      .map(
        (a) => `
echo "PHASE extract-${a.name} $(date +%s)"
mkdir -p /vercel/sandbox/next-${a.name} && tar -xzf /vercel/sandbox/tree-${a.name}.tgz -C /vercel/sandbox/next-${a.name}`
      )
      .join('\n')
    const installs = cfg.arms
      .filter((a) => !a.treeCached)
      .map(
        (a) => `
echo "PHASE install-${a.name} $(date +%s)"
${a.tgz ? `mkdir -p /vercel/sandbox/arm-${a.name} && tar -xzf /vercel/sandbox/arm-${a.name}.tgz -C /vercel/sandbox/arm-${a.name}` : ':'}
mkdir -p /vercel/sandbox/next-${a.name} && cd /vercel/sandbox/next-${a.name} && tar -xzf /vercel/sandbox/${path.basename(a.nextTgz)} 2>/dev/null
pnpm install --frozen-lockfile >/tmp/i-${a.name}.log 2>&1 || (tail -10 /tmp/i-${a.name}.log; exit 1)`
      )
      .join('\n')
    const builds = cfg.arms
      .filter((a) => !a.treeCached)
      .map(
        (a, i) => `
(
  set -e
  cd /vercel/sandbox/next-${a.name}
  echo "PHASE build-${a.name} $(date +%s)"
  pnpm build >/tmp/b-${a.name}.log 2>&1
  ${a.tgz ? `pnpm run sync-react --version "file:///vercel/sandbox/arm-${a.name}/" >/tmp/s-${a.name}.log 2>&1` : ': # vendored react, no sync'}
  pnpm --filter=@next/font build >/dev/null 2>&1
  echo "PHASE next-build-${a.name} $(date +%s)"
  pnpm --filter=next build >/tmp/n-${a.name}.log 2>&1
) &
BUILD_${i}=$!`
      )
      .join('\n')
    const waits = cfg.arms
      .filter((a) => !a.treeCached)
      .map(
        (a, i) =>
          `wait $BUILD_${i} || (tail -10 /tmp/b-${a.name}.log /tmp/s-${a.name}.log /tmp/n-${a.name}.log; exit 1)`
      )
      .join('\n')
    // Warm + verify runs per tree, sequential (they bind the same port).
    const verifies = cfg.arms
      .map(
        (a) => `
cd /vercel/sandbox/next-${a.name}
VER=$(grep -aom1 "[0-9.]*-\\(canary\\|experimental\\)-[0-9a-f]*-[0-9]*" packages/next/dist/compiled/react-experimental/cjs/react.development.js || echo MISSING)
echo "tree ${a.name} ver=$VER"
[ "$VER" != MISSING ]
echo "PHASE warm-${a.name} $(date +%s)"
pnpm bench:render-pipeline --scenario=e2e --stream-mode=node --build=true --port=3720 --routes=${cfg.routes} --warmup-requests=1 --serial-requests=2 --load-requests=2 --load-concurrency=1 --json-out=/tmp/warm.json --artifact-dir=/tmp/warm-art >/tmp/w.log 2>&1 || (tail -10 /tmp/w.log; exit 1)
rm -rf /tmp/warm-art /tmp/warm.json
${a.treeCached ? ':' : `echo "PHASE pack-${a.name} $(date +%s)" && tar -czf /vercel/sandbox/tree-${a.name}-out.tgz -C /vercel/sandbox/next-${a.name} .`}
echo "tree ${a.name} ready"`
      )
      .join('\n')
    await sbExec(
      vm,
      '55m',
      `set -e\nnpm i -g pnpm@10.33.0 >/dev/null 2>&1\n` +
        `(while true; do echo "hb mem=$(free -m | awk '/^Mem/{print $3}')MB"; sleep 30; done) & HB=$!\n` +
        `${extractCached}\n${installs}\n${builds}\n${waits}\n${verifies}\nkill $HB\n` +
        `echo "PHASE done $(date +%s)"\n` +
        `find /vercel/sandbox -maxdepth 1 -name '*.tgz' ! -name 'tree-*-out.tgz' -delete\necho experiment ready`,
      'expsnap'
    )
    // Pull freshly built trees into the cache before snapshotting (the
    // snapshot must not contain the multi-GB tarballs).
    for (const arm of cfg.arms) {
      if (!arm.treeCached) {
        console.error(`caching built tree for ${arm.name}...`)
        // Temp + rename: concurrent launchers may cache the same tree.
        const treeTmp = `${arm.treeTgz}.tmp-${process.pid}`
        await sb([
          'cp',
          `${vm}:/vercel/sandbox/tree-${arm.name}-out.tgz`,
          treeTmp,
        ])
        if (fs.existsSync(treeTmp) && fs.statSync(treeTmp).size >= 50_000_000) {
          fs.renameSync(treeTmp, arm.treeTgz)
        } else {
          fs.rmSync(treeTmp, { force: true })
          console.error(
            `tree cache download for ${arm.name} too small; skipping cache (snapshot unaffected)`
          )
        }
      }
    }
    await sbExec(
      vm,
      '5m',
      `rm -f /vercel/sandbox/tree-*.tgz /vercel/sandbox/tree-*-out.tgz; echo cleaned`,
      'expsnap'
    )
    return await takeSnapshot(vm, CACHE, key)
  } finally {
    await rmVm(vm)
  }
}

// ---------------------------------------------------------------- stage

// React CI builds every upstream commit and PR; reuse those artifacts
// instead of building. Requires gh auth. Returns false -> build remotely.
async function tryCiArtifactArm(sha, cached, pack) {
  try {
    const runs = JSON.parse(
      (
        await execFileP(
          'gh',
          [
            'api',
            `repos/${REACT_GH_REPO}/actions/workflows/runtime_build_and_test.yml/runs?head_sha=${sha}&per_page=5`,
          ],
          { maxBuffer: 1 << 24 }
        )
      ).stdout
    )
    const id = runs.workflow_runs?.find((r) => r.head_sha === sha)?.id
    if (!id) return false
    const arts = JSON.parse(
      (
        await execFileP(
          'gh',
          [
            'api',
            `repos/${REACT_GH_REPO}/actions/runs/${id}/artifacts?name=artifacts_combined`,
          ],
          { maxBuffer: 1 << 24 }
        )
      ).stdout
    )
    const art = arts.artifacts?.find(
      (a) => a.name === 'artifacts_combined' && !a.expired
    )
    if (!art) return false
    console.error(
      `downloading CI artifacts for ${sha.slice(0, 12)} (run ${id})...`
    )
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-arm-'))
    try {
      await execFileP(
        'bash',
        [
          '-c',
          `cd ${work} && gh api repos/${REACT_GH_REPO}/actions/artifacts/${art.id}/zip > a.zip && ` +
            `unzip -q a.zip && tar -xzf build.tgz && ${pack}`,
        ],
        { maxBuffer: 1 << 24 }
      )
    } finally {
      fs.rmSync(work, { recursive: true, force: true })
    }
    return fs.existsSync(cached) && fs.statSync(cached).size > 1 << 20
  } catch (e) {
    console.error(
      `CI artifact lookup failed (${e.message.slice(0, 100)}); building remotely`
    )
    return false
  }
}

// Ref arms build remotely (dual-channel yarn build) and cache by sha.
async function ensureRefArm(arm) {
  const sha = (
    await execFileP('git', ['-C', REACT_REPO_LAZY(), 'rev-parse', arm.ref])
  ).stdout.trim()
  arm.sha = sha
  // Key on the build recipe too: a changed target list must not serve
  // stale artifacts from the shared cache.
  const recipe = crypto
    .createHash('sha256')
    .update(E2E_BUILD_TARGETS)
    .digest('hex')
    .slice(0, 6)
  const cached = path.join(CACHE, `arm-${sha.slice(0, 12)}-${recipe}.tgz`)
  arm.tgz = cached
  if (fs.existsSync(cached)) {
    console.error(`arm ${arm.name}=${sha.slice(0, 12)} (cached build)`)
    return
  }
  fs.mkdirSync(CACHE, { recursive: true })
  if (
    await tryCiArtifactArm(
      sha,
      cached,
      `tar -czf ${cached} build/oss-stable build/oss-experimental`
    )
  ) {
    console.error(`arm ${arm.name}=${sha.slice(0, 12)} from CI artifacts`)
    return
  }
  const snap = await ensureReactBuildSnapshot(sha)
  const vm = `sbench-armbuild-${Date.now().toString(36)}`
  console.error(`building e2e arm ${arm.name}=${sha.slice(0, 12)} remotely...`)
  await sb([
    'create',
    '--name',
    vm,
    '--snapshot',
    snap,
    '--vcpus',
    '8',
    '--timeout',
    '45m',
    '--non-persistent',
    '--network-policy',
    'allow-all',
    '--tag',
    'purpose=sandbox-bench',
    '--silent',
  ])
  try {
    // build-all-release-channels stamps versions from git (sha + commit
    // date), so the upload must be a real shallow checkout, not a bare
    // archive.
    const src = path.join(os.tmpdir(), `arm-src-${sha.slice(0, 12)}.tgz`)
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'arm-git-'))
    const tmpRef = `refs/bench-tmp/${sha.slice(0, 12)}`
    await execFileP('git', ['-C', REACT_REPO_LAZY(), 'update-ref', tmpRef, sha])
    try {
      await execFileP('git', ['init', '-q', work])
      await execFileP('git', [
        '-C',
        work,
        'fetch',
        '-q',
        '--depth',
        '1',
        REACT_REPO_LAZY(),
        tmpRef,
      ])
      await execFileP('git', ['-C', work, 'checkout', '-q', 'FETCH_HEAD'])
      await execFileP('bash', [
        '-c',
        `cd ${work} && COPYFILE_DISABLE=1 tar --no-xattrs -czf ${src} .`,
      ])
    } finally {
      await execFileP('git', [
        '-C',
        REACT_REPO_LAZY(),
        'update-ref',
        '-d',
        tmpRef,
      ])
      fs.rmSync(work, { recursive: true, force: true })
    }
    await sb(['cp', src, `${vm}:/vercel/sandbox/src.tgz`])
    fs.rmSync(src, { force: true })
    // The exec stream drops on long silent commands; heartbeat keeps it
    // alive during the ~10min dual-channel build. Newline before the
    // backgrounded heartbeat: a trailing & after && backgrounds the
    // whole chain.
    await sbExec(
      vm,
      '40m',
      `set -e
ls /vercel/sandbox/react/node_modules >/dev/null
cd /vercel/sandbox/react
find . -mindepth 1 -maxdepth 1 ! -name node_modules -exec rm -rf {} +
tar -xzf ../src.tgz
git rev-parse HEAD
(while true; do echo "hb mem=$(free -m | awk '/^Mem/{print $3}')MB $(tail -1 /tmp/build.log 2>/dev/null | cut -c1-60)"; sleep 30; done) & HB=$!
yarn build "${E2E_BUILD_TARGETS}" >/tmp/build.log 2>&1 || (kill $HB; tail -20 /tmp/build.log; exit 1)
kill $HB
tar -czf /vercel/sandbox/arm.tgz build/oss-stable build/oss-experimental
echo arm built`,
      `armbuild:${arm.name}`
    )
    fs.mkdirSync(CACHE, { recursive: true })
    const armTmp = `${cached}.tmp-${process.pid}`
    await sb(['cp', `${vm}:/vercel/sandbox/arm.tgz`, armTmp])
    if (fs.existsSync(armTmp)) fs.renameSync(armTmp, cached)
    // sandbox cp does not reliably fail on missing remote files.
    if (!fs.existsSync(cached) || fs.statSync(cached).size < 1 << 20) {
      fs.rmSync(cached, { force: true })
      throw new Error(
        `arm ${arm.name}: downloaded artifact missing or too small`
      )
    }
    console.error(`cached ${cached}`)
  } finally {
    await rmVm(vm)
  }
}

async function stage(cfg, tmp) {
  const nextTgzBySha = new Map()
  for (const arm of cfg.arms) {
    if (!nextTgzBySha.has(arm.nextSha)) {
      const tgz = path.join(tmp, `next-src-${arm.nextSha.slice(0, 12)}.tgz`)
      await execFileP('bash', [
        '-c',
        `git -C ${NEXT_REPO_LAZY()} archive ${arm.nextSha} | gzip -1 > ${tgz}`,
      ])
      nextTgzBySha.set(arm.nextSha, tgz)
    }
    arm.nextTgz = nextTgzBySha.get(arm.nextSha)
    if (arm.ref) {
      arm.sha = (
        await execFileP('git', ['-C', REACT_REPO_LAZY(), 'rev-parse', arm.ref])
      ).stdout.trim()
      await assertCiGreen(arm.sha, arm.name, cfg.allowUngated)
      await ensureRefArm(arm)
    }
  }
}

// ------------------------------------------------------------------ run

async function runVm(index, cfg, expSnap, outDir) {
  const vm = `sbench-${cfg.label}-${index}-${Date.now().toString(36)}`
  const tag = `vm${index}`
  console.error(`${tag}: creating ${vm} from experiment snapshot`)
  writeStatus({
    vms: { ...statusState.vms, [vm]: { state: 'booting', rows: 0 } },
  })
  await sb([
    'create',
    '--name',
    vm,
    '--snapshot',
    expSnap,
    '--vcpus',
    '8',
    '--timeout',
    '5h',
    '--non-persistent',
    '--network-policy',
    'allow-all',
    '--tag',
    'purpose=sandbox-bench',
    '--silent',
  ])
  try {
    const [base, cand] = cfg.arms.map((a) => a.name)
    const total = cfg.blocks * cfg.runs
    const benchArgs = (extra) =>
      `--scenario=e2e --stream-mode=node --build=false --port=$PORT ` +
      `--routes=${cfg.routes} --warmup-requests=${cfg.warmup} --serial-requests=${cfg.serial} ` +
      `--load-requests=${cfg.loadRequests} --load-concurrency=${cfg.loadConcurrency} ` +
      `${cfg.isolateRoutes ? '--isolate-routes=true ' : ''}${extra}`
    // Both trees are pre-built in the snapshot; a run is pure
    // measurement. ABBA: alternate which arm goes first per run so
    // linear drift cancels within pairs, not just across them.
    const loop = `set -e
VMINDEX=${index}
CPU=$(grep -m1 'model name' /proc/cpuinfo | cut -d: -f2- | sed 's/^ //')
: > /vercel/sandbox/results.jsonl
for arm in ${base} ${cand}; do
  V=$(grep -aom1 "[0-9.]*-\\(canary\\|experimental\\)-[0-9a-f]*-[0-9]*" /vercel/sandbox/next-$arm/packages/next/dist/compiled/react-experimental/cjs/react.development.js || echo MISSING)
  for f in ${FP_FILES.map((f) => `/vercel/sandbox/next-$arm/${f}`).join(' ')}; do [ -s "$f" ] || { echo "FP file missing: $f"; exit 1; }; done
  F=$(cat ${FP_FILES.map((f) => `/vercel/sandbox/next-$arm/${f}`).join(' ')} | sha256sum | cut -c1-12)
  echo "tree $arm ver=$V fp=$F"; [ "$V" != MISSING ]
  eval "VER_$arm=$V; FP_$arm=$F"
done
for run in $(seq 1 ${total}); do
  # Alternate within the boot AND stagger by VM index: with an odd run
  # count, otherwise every boot gives the same arm the cold first slot
  # and boot-level inference reads that shared bias as signal.
  if [ $(((run + VMINDEX) % 2)) = 1 ]; then ORDER="${cand} ${base}"; else ORDER="${base} ${cand}"; fi
  for arm in $ORDER; do
    # One port per arm: a not-quite-dead server from a previous run can
    # then never be measured as the other arm.
    if [ "$arm" = "${base}" ]; then PORT=3720; else PORT=3721; fi
    cd /vercel/sandbox/next-$arm
    ${cfg.benchEnv ? `export ${cfg.benchEnv}` : ':'}
    pnpm bench:render-pipeline ${benchArgs('')} \
      --json-out=/tmp/r.json --artifact-dir=/tmp/art-$arm-r$run >/tmp/bench.log 2>&1 \
      || (tail -20 /tmp/bench.log; exit 1)
    rm -rf /tmp/art-$arm-r$run
    eval "FP=\\$FP_$arm; VER=\\$VER_$arm"
    node -e '
      const [,run,arm,fp,ver,cpu]=process.argv;
      const j=require("/tmp/r.json");
      const docs=new Map((j.fullResults[0].routeDocuments??[]).map(d=>[d.route,d]));
      for (const rr of j.fullResults[0].routeResults) {
        if (!rr.latency) continue;
        const row={block:+run,arm,run:1,fp,ver,cpu,route:rr.route,
          phase:rr.phase,rps:rr.throughputRps,median:rr.latency.median,
          mean:rr.latency.mean,p95:rr.latency.p95};
        // Optional metrics are OMITTED when absent — a zero would pair
        // against a real value as a fabricated -100% claim.
        if (rr.latency.p99>0) row.p99=rr.latency.p99;
        if (rr.ttfb&&rr.ttfb.median>0) row.ttfb=rr.ttfb.median;
        if (rr.serverRssMb>0) row.rss=rr.serverRssMb;
        if (rr.serverRssHwMb>0) row.rssHw=rr.serverRssHwMb;
        const d=docs.get(rr.route)??{};
        if (d.bytes>0) row.docKb=d.bytes/1024;
        if (d.gzipBytes>0) row.gzipKb=d.gzipBytes/1024;
        if (d.inlineFlightBytes>0) row.flightKb=d.inlineFlightBytes/1024;
        // Failed requests inflate rps and vanish from latency: surface.
        if (rr.errors>0) row.errors=rr.errors;
        console.log(JSON.stringify(row));
      }
    ' "$run" "$arm" "$FP" "$VER" "$CPU" > /tmp/rows.txt
    cat /tmp/rows.txt >> /vercel/sandbox/results.jsonl
    sed 's/^/ROW /' /tmp/rows.txt
    echo "run $run $arm done"
  done
done
wc -l /vercel/sandbox/results.jsonl`
    let vmRows = 0
    const out = await runDetached(
      vm,
      tag,
      loop,
      (row) => {
        vmRows++
        interimRows.push({ vm: index, ...row })
        writeStatus({
          vms: {
            ...statusState.vms,
            [vm]: { state: 'measuring', rows: vmRows },
          },
        })
        cfg.live(index, row)
      },
      110
    )
    writeStatus({
      vms: {
        ...statusState.vms,
        [vm]: { ...statusState.vms[vm], state: 'collecting' },
      },
    })
    const local = path.join(outDir, `results-vm${index}.jsonl`)
    await sb(['cp', `${vm}:/vercel/sandbox/results.jsonl`, local])
    const remoteCount = Number(
      out.match(/(\d+) \/vercel\/sandbox\/results\.jsonl/)?.[1] ?? NaN
    )
    const localCount = fs
      .readFileSync(local, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean).length
    if (!Number.isFinite(remoteCount) || localCount !== remoteCount) {
      throw new Error(
        `${tag}: downloaded ${localCount} rows, remote reported ${remoteCount} — truncated transfer`
      )
    }

    if (cfg.profile) {
      writeStatus({
        vms: {
          ...statusState.vms,
          [vm]: { ...statusState.vms[vm], state: 'profiling' },
        },
      })
      // Profiled passes run strictly AFTER the timed runs — profiling
      // overhead must never touch the numbers.
      const prof = `set -e
for arm in ${base} ${cand}; do
  if [ "$arm" = "${base}" ]; then PORT=3720; else PORT=3721; fi
  cd /vercel/sandbox/next-$arm
  pnpm bench:render-pipeline ${benchArgs('--capture-cpu')} \
    --json-out=/tmp/pr.json --artifact-dir=/vercel/sandbox/prof-$arm >/tmp/prof.log 2>&1 \
    || (tail -10 /tmp/prof.log; exit 1)
  echo "profiled $arm"
done
cd /vercel/sandbox && tar -czf profiles.tgz prof-*`
      // Profile capture is best-effort: a failed pass or transfer on one VM
      // must not kill collection for the whole run (the timed results are
      // already on disk at this point). Each VM extracts into its own
      // subdirectory so VMs don't overwrite each other's prof-<arm> dirs.
      try {
        await sbExec(vm, '30m', prof, `${tag}:prof`)
        const profTgz = path.join(outDir, `profiles-vm${index}.tgz`)
        await sb(['cp', `${vm}:/vercel/sandbox/profiles.tgz`, profTgz])
        if (!fs.existsSync(profTgz) || fs.statSync(profTgz).size === 0) {
          throw new Error('profile tarball missing or empty after cp')
        }
        const vmProfDir = path.join(outDir, `prof-vm${index}`)
        fs.mkdirSync(vmProfDir, { recursive: true })
        await execFileP('tar', ['-xzf', profTgz, '-C', vmProfDir])
        console.error(`${tag}: profiles in ${vmProfDir}`)
      } catch (profErr) {
        console.error(
          `${tag}: profile capture failed (timed results unaffected): ${profErr.message}`
        )
      }
    }
    writeStatus({
      vms: {
        ...statusState.vms,
        [vm]: { ...statusState.vms[vm], state: 'done' },
      },
    })
    return local
  } finally {
    if (!cfg.keep) await rmVm(vm)
    else console.error(`${tag}: kept ${vm}`)
  }
}

// -------------------------------------------------------------- analyze

function pairedP(deltas) {
  const n = deltas.length
  if (n < 2) return 1
  const mean = deltas.reduce((a, b) => a + b, 0) / n
  const sd = Math.sqrt(
    deltas.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)
  )
  if (sd === 0) return mean === 0 ? 1 : 0
  const t = Math.abs(mean / (sd / Math.sqrt(n)))
  const df = n - 1
  const pdf = (x) => Math.exp(-((df + 1) / 2) * Math.log(1 + (x * x) / df))
  let integral = 0
  const STEP = 0.001
  for (let x = t; x < t + 60; x += STEP) integral += pdf(x + STEP / 2) * STEP
  let norm = 0
  for (let x = 0; x < 80; x += STEP) norm += pdf(x + STEP / 2) * STEP
  return Math.min(1, integral / norm)
}

function analyze(cfg) {
  // Collected JSONL + profiles land in the results db first; the stats
  // read the db and nothing else. Import is idempotent, verify is
  // mechanical (sqlite integrity, pairing shape, artifact hashes).
  const db = openDb()
  const { runId, samples, artifacts } = importRun(db, outDir)
  const { failures, notes } = verifyDb(db, runId)
  for (const n of notes) console.log(`note: ${n}`)
  if (failures.length) {
    throw new Error(`results db verify FAILED:\n  ${failures.join('\n  ')}`)
  }
  console.error(
    `results db: ${samples} samples, ${artifacts} artifacts as ${runId} (verify ok)`
  )
  const rows = loadRows(db, runId)
  const [base, cand] = cfg.arms.map((a) => a.name)
  printRunContext((m) => console.log(m), cfg.runContext)
  // ttfb/rss/rssHw only exist on next refs carrying the bench-client-
  // metrics harness; metrics without data are skipped.
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

// ----------------------------------------------------------------- main

// Dry-run: resolve as much as possible with local-only operations and
// print the execution plan instead of touching the sandbox. Degrades
// gracefully when prerequisites (clones, config) are missing so it can
// be used to sanity-check a setup before committing to a real run.
async function plan(cfg) {
  const lines = []
  lines.push(
    `mode: ${cfg.pr ? `react PR ${cfg.pr}` : cfg.arms.length ? 'react A/B' : cfg.nextPr ? `next PR ${cfg.nextPr}` : 'next A/B'}`
  )
  lines.push(
    `scope: team=${CONFIG.team ?? '<UNSET — ask user, then: node config.mjs set team=... project=...>'} project=${CONFIG.project ?? '<UNSET>'}`
  )
  lines.push(`next repo: ${NEXT_REPO_LAZY()}`)
  if (cfg.pr || cfg.arms.length || cfg.reactRef) {
    const rr = REACT_REPO_LAZY()
    lines.push(
      `react repo: ${rr}${fs.existsSync(path.join(rr, '.git')) ? '' : ' (would clone on real run)'}`
    )
  } else {
    lines.push('react: vendored in each Next ref (no react checkout needed)')
  }
  let arms
  try {
    arms = await resolveArms(cfg)
    for (const arm of arms) {
      if (!arm.ref) {
        lines.push(
          `arm ${arm.name}: react=vendored next=${arm.nextSha.slice(0, 12)}`
        )
        continue
      }
      let reactSha = '?'
      try {
        reactSha = (
          await execFileP('git', [
            '-C',
            REACT_REPO_LAZY(),
            'rev-parse',
            arm.ref,
          ])
        ).stdout
          .trim()
          .slice(0, 12)
      } catch {}
      const cached =
        reactSha !== '?' &&
        fs.existsSync(path.join(CACHE, `arm-${reactSha}.tgz`))
      lines.push(
        `arm ${arm.name}: react=${arm.ref} (${reactSha}${cached ? ', build cached' : ', would build remotely ~15m'}) next=${arm.nextSha.slice(0, 12)}`
      )
      lines.push(
        `  CI gate: react commit must be CI-green (or --allow-ungated after sandbox-gate.mjs)`
      )
    }
  } catch (e) {
    lines.push(
      `arms: unresolved in dry-run (${e.message.split('\n')[0].slice(0, 120)})`
    )
  }
  lines.push(
    `then: experiment snapshot (cached by content key; ~45m if cold) -> ` +
      `${cfg.vms} VMs x ${cfg.blocks * cfg.runs} paired ABBA runs, routes ${cfg.routes}` +
      `${cfg.isolateRoutes ? ' (isolated)' : ''}${cfg.benchEnv ? ` env ${cfg.benchEnv}` : ''}`
  )
  lines.push(
    `then: boot-level analysis (n=${cfg.vms} boots) -> claims at p<0.01 on A/A-validated infra`
  )
  console.log(lines.map((l) => `[dry-run] ${l}`).join('\n'))
}

const cfg = parseArgs()
if (cfg.dryRun) {
  await plan(cfg)
  process.exit(0)
}
fs.mkdirSync(CACHE, { recursive: true })
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sandbox-e2e-'))
const outDir = path.join(CACHE, `run-${cfg.label}-${Date.now().toString(36)}`)
fs.mkdirSync(outDir, { recursive: true })
// stdout, not stderr: task UIs preview stdout, and these are the lines
// a human watching the task needs.
console.log(`run dir: ${outDir}`)
statusFile = path.join(outDir, 'status.json')
// Long phases (remote builds, snapshot assembly) are otherwise silent
// on stdout, which reads as a hung task in any UI that previews output.
// A periodic one-line digest keeps the task legible without spam.
const interimRows = []
// Interim display: running effect + directional confidence
// P(effect > 0 | boots so far) — the Student-t posterior under a flat
// prior, i.e. "how sure are we the candidate is actually faster".
// Display only; runs complete their allocation and claims come from
// the final analysis.
function interimSummary() {
  if (interimRows.length === 0 || !statusState.arms) return ''
  const [base, cand] = cfg.arms.map((a) => a.name)
  const cells = []
  for (const route of cfg.routes.split(',')) {
    for (const phase of ['single-client', 'under-load']) {
      const perBoot = []
      for (const vmIdx of new Set(interimRows.map((r) => r.vm))) {
        const deltas = []
        for (const r of interimRows.filter(
          (x) =>
            x.vm === vmIdx &&
            x.route === route &&
            x.phase === phase &&
            x.arm === cand
        )) {
          const b = interimRows.find(
            (x) =>
              x.vm === vmIdx &&
              x.route === route &&
              x.phase === phase &&
              x.arm === base &&
              x.block === r.block &&
              x.run === r.run
          )
          if (b && b.rps > 0 && r.rps > 0) deltas.push((r.rps - b.rps) / b.rps)
        }
        if (deltas.length)
          perBoot.push(deltas.reduce((a, b) => a + b, 0) / deltas.length)
      }
      if (perBoot.length < 4) continue
      const mean = perBoot.reduce((a, b) => a + b, 0) / perBoot.length
      const pTwo = tTestP(perBoot)
      const conf = Math.max(1 - pTwo / 2, pTwo / 2)
      const confStr = conf >= 0.999 ? '>99.9%' : `${(conf * 100).toFixed(0)}%`
      const label = `${route} ${phase === 'single-client' ? 'serial' : 'load'}:`
      cells.push(
        `    ${label.padEnd(19)} ${mean > 0 ? '+' : ''}${(mean * 100).toFixed(1)}% rps (${confStr} confidence)`
      )
    }
  }
  if (cells.length === 0) return ''
  const boots = new Set(interimRows.map((r) => r.vm)).size
  return `\n  interim vs base (${boots} boots):\n` + cells.join('\n')
}
const digest = setInterval(() => {
  const vms = Object.values(statusState.vms ?? {})
  const rows = vms.reduce((a, v) => a + (v.rows ?? 0), 0)
  const states = {}
  for (const v of vms) states[v.state] = (states[v.state] ?? 0) + 1
  const vmSummary = Object.entries(states)
    .map(([k, n]) => `${n} ${k}`)
    .join(', ')
  console.log(
    `progress: ${statusState.phase}` +
      (statusState.rowsExpected
        ? ` — rows ${rows}/${statusState.rowsExpected}`
        : '') +
      (vmSummary ? ` (${vmSummary})` : '') +
      interimSummary()
  )
}, 120_000)
digest.unref?.()
writeStatus({
  label: cfg.label,
  phase: 'resolving arms',
  pid: process.pid,
  startedAt: new Date().toISOString(),
  vms: {},
  rowsExpected: null,
})
try {
  cfg.arms = await resolveArms(cfg)
  cfg.runContext = await describeRun(cfg)
  printRunContext((m) => console.error(m), cfg.runContext)
  fs.writeFileSync(
    path.join(outDir, 'meta.json'),
    JSON.stringify(
      {
        base: cfg.arms[0].name,
        cand: cfg.arms[1].name,
        label: cfg.label,
        nextRef: cfg.nextRef,
        vms: cfg.vms,
        blocks: cfg.blocks,
        runs: cfg.runs,
        routes: cfg.routes,
        pr: cfg.runContext.pr,
        arms: cfg.runContext.arms,
        benchEnv: cfg.benchEnv || undefined,
      },
      null,
      2
    )
  )
  cfg.live = makeLive(
    cfg.arms[0].name,
    ['rps', 'median', 'p95'],
    (r) => `${r.route} ${r.phase}`
  )
  await stage(cfg, tmp)
  console.error(
    `arms: ${cfg.arms.map((a) => `${a.name}=${armId(a)}`).join(' ')}`
  )
  writeStatus({
    phase: 'building arms + experiment snapshot',
    arms: cfg.arms.map((a) => `${a.name}=${armId(a)}`),
  })
  const expSnap = await ensureExperimentSnapshot(cfg)
  writeStatus({
    phase: 'measuring',
    expSnap,
    rowsExpected:
      cfg.vms * cfg.blocks * cfg.runs * 2 * cfg.routes.split(',').length * 2,
  })
  if (cfg.prepare) {
    console.error(
      `prepared: arms + experiment snapshot ${expSnap}; exiting (--prepare)`
    )
    process.exit(0)
  }
  await Promise.all(
    Array.from({ length: cfg.vms }, (_, i) => runVm(i, cfg, expSnap, outDir))
  )
  writeStatus({ phase: 'analyzing' })
  console.error(`results in ${outDir}`)
  analyze(cfg)
  writeStatus({ phase: 'done' })
} catch (err) {
  // Leave a machine-readable trace: bench-status.mjs reports dead runs
  // and the right recovery action from this.
  writeStatus({
    phase: 'failed',
    error: String((err && err.message) || err).slice(0, 500),
  })
  throw err
} finally {
  fs.rmSync(tmp, { recursive: true, force: true })
}
