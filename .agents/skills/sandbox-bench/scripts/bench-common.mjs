// Shared core for the sandbox-bench launchers (sandbox-e2e.mjs,
// sandbox-ssr.mjs): config-derived constants, vercel sandbox plumbing
// (exec, chunked upload, detached loops), PR/arm resolution with the
// CI-green gate, cached react arm builds, snapshots, the status.json
// recovery record, and live interim estimates. Workload-specific code
// (what runs on a measurement VM) stays in each launcher.
import { execFile, spawn } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import {
  loadConfig,
  sandboxScope,
  ensureNextRepo,
  ensureReactRepo,
} from './config.mjs'

const execFileP = promisify(execFile)
export { execFileP }

export const DRY_RUN = process.argv.includes('--dry-run')
export const CONFIG = loadConfig({ requireScope: !DRY_RUN })
// Clones happen on first use: the react one only when a react ref is
// benched or pinned (pure Next A/B uses each ref's vendored React).
export let nextRepoResolved
export function NEXT_REPO_LAZY() {
  if (!nextRepoResolved) nextRepoResolved = ensureNextRepo(CONFIG)
  return nextRepoResolved
}
export let reactRepoResolved
export function REACT_REPO_LAZY() {
  if (!reactRepoResolved) reactRepoResolved = ensureReactRepo(CONFIG)
  return reactRepoResolved
}
export const VERCEL = CONFIG.vercelBin
export const SCOPE = CONFIG.team ? sandboxScope(CONFIG) : []
export const CACHE = path.join(CONFIG.cacheDir, 'e2e')
export const REACT_SNAP_CACHE = path.join(CONFIG.cacheDir, 'react-snap')
export const SETUP_VERSION = 'v1-al2023-node24-jdk21'
// Targets build-all-release-channels needs for a sync-react-able arm
// (both channels, oss-stable + oss-experimental).
export const E2E_BUILD_TARGETS =
  'react/,react.react-server,react-dom/,react-dom.,react-dom-server,scheduler/,react-is,react-server-dom-turbopack,react-server-dom-webpack'
// owner/repo for CI-artifact lookup, from the configured clone URL.
export const REACT_GH_REPO =
  CONFIG.reactRepoUrl.match(/github\.com[:/]+([^/]+\/[^/.]+)/)?.[1] ??
  'react/react'
export const NEXT_GH_REPO =
  CONFIG.nextRepoUrl.match(/github\.com[:/]+([^/]+\/.+?)(?:\.git)?$/)?.[1] ??
  'vercel/next.js'

// Recovery record for bench-collect.mjs: if a launcher dies, the
// remote VMs keep executing their detached loops, and this file names
// them so the results can still be collected.
export const status = { file: null, state: {} }
export function writeStatus(patch) {
  if (!status.file) return
  status.state = {
    ...status.state,
    ...patch,
    updatedAt: new Date().toISOString(),
  }
  try {
    fs.writeFileSync(status.file, JSON.stringify(status.state, null, 2))
  } catch {}
}

export async function sb(args, opts = {}) {
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
export const CP_CHUNK_BYTES = 128 * 1024 * 1024
export async function sbCpToVm(vm, localPath, vmDest) {
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

export // PR spec ("37023" or a github PR URL) -> arms: base = merge-base of the
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

// Green CI on the react repo is the correctness gate for react arms: a
// perf number from a broken build is worse than no number. Local or
// unpushed refs have no CI — --allow-ungated skips the check, and
// sandbox-gate.mjs exists to gate such refs on a VM instead.
const ciVerdicts = new Map()
export async function assertCiGreen(sha, armName, allowUngated) {
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

export async function commitTitle(repo, ref) {
  try {
    return (
      await execFileP('git', ['-C', repo, 'log', '-1', '--format=%s', ref])
    ).stdout.trim()
  } catch {
    return undefined
  }
}

export function printRunContext(out, d) {
  if (!d) return
  if (d.pr) out(`PR: ${d.pr.title ? `"${d.pr.title}" — ` : ''}${d.pr.url}`)
  for (const a of d.arms ?? []) if (a.title) out(`  ${a.name}: "${a.title}"`)
}

// Live running estimate, printed as pairs complete across all VMs.
const T95 = [
  12.71, 4.3, 3.18, 2.78, 2.57, 2.45, 2.36, 2.31, 2.26, 2.23, 2.2, 2.18, 2.16,
  2.14, 2.13,
]
export function makeLive(baseName, metrics, keyOf) {
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

export function pairedP(deltas) {
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

export function sbExec(vm, timeout, script, tag, onRow) {
  return new Promise((resolve, reject) => {
    // The CLI does not reliably propagate the remote exit code (observed
    // exit 0 after a remote `exit 1`, CLI 56.3.x), so the script reports
    // its own exit through an EXIT-trap marker; no marker means the
    // transport died mid-run. Both are failures.
    const wrapped = `trap 'echo "@@EXEC_EXIT $?"' EXIT
${script}`
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
        wrapped,
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
    child.on('exit', (code) => {
      const marker = out.match(/@@EXEC_EXIT (\d+)\s*$/m)
      if (code === 0 && marker && marker[1] === '0') {
        resolve(out)
      } else {
        const why =
          code !== 0
            ? `cli exit ${code}`
            : marker
              ? `remote exit ${marker[1]}`
              : 'no exit marker (transport died mid-run)'
        reject(new Error(`${tag}: ${why}\n${out.slice(-2000)}`))
      }
    })
  })
}

export async function rmVm(name) {
  try {
    await sb(['rm', name])
  } catch (e) {
    process.stderr.write(`warning: could not remove ${name}: ${e.message}\n`)
  }
}

// Long-running remote work detached from the exec stream (streams drop
// flakily on multi-minute silences): nohup the script on the VM, then
// poll its log with short execs. Immune to transport hiccups.
export async function runDetached(vm, tag, script, onLine, deadlineMin) {
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

export async function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16)
}

export async function snapshotIdFor(cacheDir, key) {
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

export async function takeSnapshot(vm, cacheDir, key) {
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
export async function ensureReactBuildSnapshot(refSha) {
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

// React CI builds every upstream commit and PR; reuse those artifacts
// instead of building. Requires gh auth. Returns false -> build remotely.
export async function tryCiArtifactArm(sha, cached, pack) {
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
export async function ensureRefArm(arm) {
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
  console.error(
    `building react arm ${arm.name}=${sha.slice(0, 12)} remotely...`
  )
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
