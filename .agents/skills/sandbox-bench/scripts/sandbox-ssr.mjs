// Remote React SSR A/B on Vercel Sandbox via the react repo's
// fixtures/flight-ssr-bench: 8 render variants (Fizz and Flight+Fizz,
// Node and Edge streams, sync and async), both arms always in the SAME
// VM, paired per (block, run), ABBA order. The VM boot is the unit of
// replication; see bench-stats.mjs.
//
// This is the Edge-path complement to sandbox-e2e.mjs (which measures
// the Node path through a real Next.js app). Arms vary React only. The
// fixture (the workload) is pinned to ONE ref for both arms — default
// the react main tip — so only the React builds differ.
//
// Usage:
//   node sandbox-ssr.mjs --pr <react pr url|num> [--vms 16] [--label x]
//   node sandbox-ssr.mjs --arms base=<ref>,cand=<ref>
//   Common: [--runs 2] [--fixture-ref main] [--no-profile] [--keep]
//     [--allow-ungated] [--dry-run]
import fs from 'fs'
import os from 'os'
import path from 'path'
import { analyzeE2eRows } from './bench-stats.mjs'
import { openDb, importRun, loadRows, verify as verifyDb } from './bench-db.mjs'
import {
  execFileP,
  CONFIG,
  REACT_REPO_LAZY,
  CACHE,
  SETUP_VERSION,
  REACT_GH_REPO,
  status,
  writeStatus,
  sb,
  sbExec,
  rmVm,
  runDetached,
  resolvePrArms,
  assertCiGreen,
  commitTitle,
  printRunContext,
  makeLive,
  sha256,
  snapshotIdFor,
  takeSnapshot,
  ensureRefArm,
} from './bench-common.mjs'

const FIXTURE_DIR = 'fixtures/flight-ssr-bench'
// Provenance: the Flight server/client files the fixture actually
// executes — Node and Edge entry points, so changes touching only one
// stream flavor still move the fingerprint.
const FP_FILES = [
  'react-server-dom-webpack/cjs/react-server-dom-webpack-server.node.production.js',
  'react-server-dom-webpack/cjs/react-server-dom-webpack-server.edge.production.js',
  'react-server-dom-webpack/cjs/react-server-dom-webpack-client.edge.production.js',
  'react-dom/cjs/react-dom-server.node.production.js',
  'react-dom/cjs/react-dom-server.edge.production.js',
]

function parseArgs() {
  const a = process.argv.slice(2)
  const get = (name, dflt) => {
    const i = a.indexOf(name)
    return i >= 0 ? a[i + 1] : dflt
  }
  const arms = get('--arms', '')
    .split(',')
    .filter(Boolean)
    .map((s) => {
      const [name, src] = s.split('=')
      if (!name || !src)
        throw new Error(`bad arm "${s}" in --arms, want name=<ref>`)
      return { name, ref: src }
    })
  const pr = get('--pr', undefined)
  if ((pr ? 1 : 0) + (arms.length ? 1 : 0) !== 1) {
    throw new Error('need exactly one of: --pr, --arms')
  }
  if (arms.length && arms.length !== 2)
    throw new Error('--arms needs exactly two arms (base first)')
  return {
    arms,
    pr,
    dryRun: a.includes('--dry-run'),
    allowUngated: a.includes('--allow-ungated'),
    // The workload: one fixture tree shared by both arms.
    fixtureRef: get('--fixture-ref', 'main'),
    runs: Number(get('--runs', '2')),
    vms: Number(get('--vms', '16')),
    keep: a.includes('--keep'),
    profile: !a.includes('--no-profile'),
    label: get('--label', 'ssr'),
  }
}

// Resolve a react ref: shas and already-fetched refs locally, branch
// names against the remote (so "main" is today's main), pinned once
// per run.
const reactShaMemo = new Map()
async function reactShaFor(ref) {
  if (reactShaMemo.has(ref)) return reactShaMemo.get(ref)
  const repo = REACT_REPO_LAZY()
  let sha
  if (/^[0-9a-f]{7,40}$/i.test(ref)) {
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
    const dst = `refs/bench-tmp/${process.pid}/ssr-${reactShaMemo.size}`
    for (let attempt = 1; ; attempt++) {
      try {
        await execFileP('git', [
          '-C',
          repo,
          'fetch',
          '-q',
          CONFIG.reactRepoUrl,
          `+${ref}:${dst}`,
        ])
        break
      } catch (e) {
        if (attempt >= 3) throw e
        await new Promise((r) => setTimeout(r, 2000 * attempt))
      }
    }
    sha = (
      await execFileP('git', ['-C', repo, 'rev-parse', `${dst}^{commit}`])
    ).stdout.trim()
  }
  reactShaMemo.set(ref, sha)
  return sha
}

async function resolveArms(cfg) {
  const arms = cfg.pr
    ? await resolvePrArms(
        cfg.pr,
        REACT_REPO_LAZY(),
        CONFIG.reactRepoUrl,
        'main'
      )
    : cfg.arms
  for (const arm of arms) {
    arm.sha = await reactShaFor(arm.ref)
  }
  cfg.fixtureSha = await reactShaFor(cfg.fixtureRef)
  console.error(
    `fixture: ${FIXTURE_DIR} @ ${cfg.fixtureRef} (${cfg.fixtureSha.slice(0, 12)})`
  )
  // The fixture must emit machine-readable results; parsing its human
  // tables would silently break as it evolves.
  const benchJs = (
    await execFileP(
      'git',
      [
        '-C',
        REACT_REPO_LAZY(),
        'show',
        `${cfg.fixtureSha}:${FIXTURE_DIR}/bench.js`,
      ],
      { maxBuffer: 1 << 24 }
    )
  ).stdout
  if (!benchJs.includes('--json-out')) {
    throw new Error(
      `the fixture at ${cfg.fixtureRef} does not support --json-out; ` +
        'pass --fixture-ref <ref that does> (see SKILL.md)'
    )
  }
  // The workload is pinned; if the PR itself changes the fixture, this
  // run will NOT measure those changes. Say so rather than silently
  // benching something else.
  const touched = (
    await execFileP('git', [
      '-C',
      REACT_REPO_LAZY(),
      'diff',
      '--name-only',
      `${arms[0].sha}..${arms[1].sha}`,
      '--',
      FIXTURE_DIR,
    ])
  ).stdout.trim()
  if (touched) {
    cfg.fixtureTouchedByPr = true
    console.error(
      `NOTE: the candidate changes ${FIXTURE_DIR} itself; the benchmark ` +
        `uses the pinned fixture (${cfg.fixtureSha.slice(0, 12)}) and does ` +
        `not measure those fixture changes:\n${touched}`
    )
  }
  return arms
}

// Snapshot: fixture installed + both arms' builds staged, so run VMs
// boot straight into measurement.
async function ensureSsrSnapshot(cfg) {
  const key = await sha256(
    SETUP_VERSION +
      'ssr1' +
      cfg.fixtureSha +
      cfg.arms.map((a) => `${a.name}=${a.sha}`).join()
  )
  let id = await snapshotIdFor(CACHE, key)
  if (id) return id
  const vm = `sbench-ssrsnap-${Date.now().toString(36)}`
  console.error(
    `creating ssr snapshot (one-time for fixture=${cfg.fixtureSha.slice(0, 12)} ` +
      `arms=${cfg.arms.map((a) => a.sha.slice(0, 12)).join(',')})...`
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
    const fixtureTgz = path.join(
      os.tmpdir(),
      `ssr-fixture-${cfg.fixtureSha.slice(0, 12)}.tgz`
    )
    await execFileP('bash', [
      '-c',
      `git -C ${REACT_REPO_LAZY()} archive ${cfg.fixtureSha} ${FIXTURE_DIR} | gzip -1 > ${fixtureTgz}`,
    ])
    await sb(['cp', fixtureTgz, `${vm}:/vercel/sandbox/fixture.tgz`])
    fs.rmSync(fixtureTgz, { force: true })
    for (const arm of cfg.arms) {
      await sb(['cp', arm.tgz, `${vm}:/vercel/sandbox/arm-${arm.name}.tgz`])
    }
    const extractArms = cfg.arms
      .map(
        (a) =>
          `mkdir -p /vercel/sandbox/arm-${a.name} && tar -xzf /vercel/sandbox/arm-${a.name}.tgz -C /vercel/sandbox/arm-${a.name}`
      )
      .join('\n')
    // Smoke: one full bench pass on the base arm proves the fixture
    // installs, builds its bundle, and emits parseable JSON before 16
    // VMs boot from this snapshot.
    await sbExec(
      vm,
      '35m',
      `set -e
npm i -g yarn >/dev/null 2>&1
mkdir -p /vercel/sandbox/fixture
tar -xzf /vercel/sandbox/fixture.tgz --strip-components=2 -C /vercel/sandbox/fixture
${extractArms}
cd /vercel/sandbox/fixture
echo "PHASE install $(date +%s)"
yarn install --ignore-engines >/tmp/install.log 2>&1 || (tail -10 /tmp/install.log; exit 1)
echo "PHASE smoke $(date +%s)"
for p in /vercel/sandbox/arm-${cfg.arms[0].name}/build/oss-experimental/*; do rm -rf node_modules/$(basename $p); done
cp -r /vercel/sandbox/arm-${cfg.arms[0].name}/build/oss-experimental/* node_modules/
NODE_ENV=production node --expose-gc bench.js --json-out=/tmp/smoke.json >/tmp/smoke.log 2>&1 || (tail -20 /tmp/smoke.log; exit 1)
node -e 'const j=require("/tmp/smoke.json"); if (!Array.isArray(j.results) || j.results.length < 4) { console.error("smoke json bad"); process.exit(1); }'
rm -f /tmp/smoke.json /vercel/sandbox/fixture.tgz /vercel/sandbox/arm-*.tgz
echo "PHASE done $(date +%s)"
echo ssr env ready`,
      'ssrsnap'
    )
    return await takeSnapshot(vm, CACHE, key)
  } finally {
    await rmVm(vm)
  }
}

// ------------------------------------------------------------------ run

async function runVm(index, cfg, snap, outDir) {
  const vm = `sbench-${cfg.label}-${index}-${Date.now().toString(36)}`
  const tag = `vm${index}`
  console.error(`${tag}: creating ${vm} from ssr snapshot`)
  writeStatus({
    vms: { ...status.state.vms, [vm]: { state: 'booting', rows: 0 } },
  })
  await sb([
    'create',
    '--name',
    vm,
    '--snapshot',
    snap,
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
    // Row emitter: fixture JSON -> one row per (variant, phase), variant
    // names normalized to the server's kebab keys ("Flight + Fizz
    // (Edge, async)" -> flight-edge-async). Metrics are OMITTED when
    // absent — a zero would pair against a real value as a fabricated
    // -100% claim.
    const emit = `
      const [,run,arm,fp,ver,cpu]=process.argv;
      const key=(n)=>n.toLowerCase().replace("flight + fizz","flight")
        .replace(/[(),]/g,"").trim().replace(/\\s+/g,"-");
      const rows=[];
      const inj=require("/tmp/inject.json");
      for (const r of inj.results) {
        const row={block:+run,arm,run:1,fp,ver,cpu,route:key(r.name),phase:"inject",
          mean:r.mean,median:r.median,p95:r.p95};
        if (r.gcTotalMs>0) row.gcMs=r.gcTotalMs/r.iterations;
        if (r.heapAfter>0) row.heapMb=r.heapAfter/1048576;
        rows.push(row);
      }
      const srv=require("/tmp/server.json");
      for (const r of srv.results) {
        const row={block:+run,arm,run:1,fp,ver,cpu,route:key(r.name),
          phase:"server-c"+r.concurrency,rps:r.reqPerSec,median:r.latencyMedian};
        if (r.latencyP99>0) row.p99=r.latencyP99;
        if (r.errors>0) row.errors=r.errors;
        rows.push(row);
      }
      console.log(rows.map(r=>JSON.stringify(r)).join("\\n"));
    `
    const loop = `set -e
VMINDEX=${index}
CPU=$(grep -m1 'model name' /proc/cpuinfo | cut -d: -f2- | sed 's/^ //')
: > /vercel/sandbox/results.jsonl
cd /vercel/sandbox/fixture
for arm in ${base} ${cand}; do
  V=$(node -e "console.log(require('/vercel/sandbox/arm-$arm/build/oss-experimental/react/package.json').version)")
  F=$(cat ${FP_FILES.map((f) => `/vercel/sandbox/arm-$arm/build/oss-experimental/${f}`).join(' ')} | sha256sum | cut -c1-12)
  echo "arm $arm ver=$V fp=$F"
  eval "VER_$arm=$V; FP_$arm=$F"
done
for run in $(seq 1 ${cfg.runs}); do
  # Alternate within the boot AND stagger by VM index so no arm owns
  # the cold first slot across the fleet.
  if [ $(((run + VMINDEX) % 2)) = 1 ]; then ORDER="${cand} ${base}"; else ORDER="${base} ${cand}"; fi
  for arm in $ORDER; do
    for p in /vercel/sandbox/arm-$arm/build/oss-experimental/*; do rm -rf node_modules/$(basename $p); done
    cp -r /vercel/sandbox/arm-$arm/build/oss-experimental/* node_modules/
    NODE_ENV=production node --expose-gc bench.js --json-out=/tmp/inject.json >/tmp/bench.log 2>&1 \
      || (tail -20 /tmp/bench.log; exit 1)
    NODE_ENV=production node bench-server.js --bench --json-out=/tmp/server.json >/tmp/server.log 2>&1 \
      || (tail -20 /tmp/server.log; exit 1)
    eval "FP=\\$FP_$arm; VER=\\$VER_$arm"
    node -e '${emit}' "$run" "$arm" "$FP" "$VER" "$CPU" > /tmp/rows.txt
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
        writeStatus({
          vms: {
            ...status.state.vms,
            [vm]: { state: 'measuring', rows: vmRows },
          },
        })
        cfg.live(index, row)
      },
      160
    )
    writeStatus({
      vms: {
        ...status.state.vms,
        [vm]: { ...status.state.vms[vm], state: 'collecting' },
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
          ...status.state.vms,
          [vm]: { ...status.state.vms[vm], state: 'profiling' },
        },
      })
      // Strictly AFTER the timed runs — profiling never touches the
      // numbers. Best-effort: a failed pass must not kill collection.
      const prof = `set -e
cd /vercel/sandbox/fixture
for arm in ${base} ${cand}; do
  for p in /vercel/sandbox/arm-$arm/build/oss-experimental/*; do rm -rf node_modules/$(basename $p); done
  cp -r /vercel/sandbox/arm-$arm/build/oss-experimental/* node_modules/
  NODE_ENV=production node --expose-gc bench.js --profile >/tmp/prof.log 2>&1 || (tail -10 /tmp/prof.log; exit 1)
  mkdir -p /vercel/sandbox/prof-$arm && mv build/profiles/* /vercel/sandbox/prof-$arm/
  echo "profiled $arm"
done
cd /vercel/sandbox && tar -czf profiles.tgz prof-*`
      try {
        await sbExec(vm, '40m', prof, `${tag}:prof`)
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
        ...status.state.vms,
        [vm]: { ...status.state.vms[vm], state: 'done' },
      },
    })
    return local
  } finally {
    if (!cfg.keep) await rmVm(vm)
    else console.error(`${tag}: kept ${vm}`)
  }
}

export const SSR_METRICS = [
  'rps',
  'mean',
  'median',
  'p95',
  'p99',
  'gcMs',
  'heapMb',
]

function analyze(cfg, outDir) {
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
  console.log(`fixture: ${cfg.fixtureSha.slice(0, 12)} (${cfg.fixtureRef})`)
  analyzeE2eRows(rows, base, cand, SSR_METRICS)
}

// ----------------------------------------------------------------- main

async function plan(cfg) {
  const lines = []
  lines.push(
    `mode: ${cfg.pr ? `react PR ${cfg.pr} (ssr fixture suite)` : 'react A/B (ssr fixture suite)'}`
  )
  lines.push(
    `scope: team=${CONFIG.team ?? '<UNSET — ask user, then: node config.mjs set team=... project=...>'} project=${CONFIG.project ?? '<UNSET>'}`
  )
  try {
    const arms = await resolveArms(cfg)
    for (const arm of arms) {
      const cached = fs
        .readdirSync(CACHE)
        .some((f) => f.startsWith(`arm-${arm.sha.slice(0, 12)}`))
      lines.push(
        `arm ${arm.name}: react=${arm.sha.slice(0, 12)} (${cached ? 'build cached' : 'would build remotely ~15m'})`
      )
      lines.push(
        `  CI gate: react commit must be CI-green (or --allow-ungated after sandbox-gate.mjs)`
      )
    }
    lines.push(
      `fixture: ${FIXTURE_DIR} @ ${cfg.fixtureSha.slice(0, 12)} (pinned, both arms)`
    )
  } catch (e) {
    lines.push(
      `arms: unresolved in dry-run (${e.message.split('\n')[0].slice(0, 120)})`
    )
  }
  lines.push(
    `then: ssr snapshot (cached by content key; ~20m if cold) -> ` +
      `${cfg.vms} VMs x ${cfg.runs} paired ABBA runs, 8 variants x (inject + server c=1/c=10)`
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
const outDir = path.join(CACHE, `run-${cfg.label}-${Date.now().toString(36)}`)
fs.mkdirSync(outDir, { recursive: true })
console.log(`run dir: ${outDir}`)
status.file = path.join(outDir, 'status.json')
const digest = setInterval(() => {
  const vms = Object.values(status.state.vms ?? {})
  const rows = vms.reduce((a, v) => a + (v.rows ?? 0), 0)
  const states = {}
  for (const v of vms) states[v.state] = (states[v.state] ?? 0) + 1
  const vmSummary = Object.entries(states)
    .map(([k, n]) => `${n} ${k}`)
    .join(', ')
  console.log(
    `progress: ${status.state.phase}` +
      (status.state.rowsExpected
        ? ` — rows ${rows}/${status.state.rowsExpected}`
        : '') +
      (vmSummary ? ` (${vmSummary})` : '')
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
  // Human context for the analysis header and meta.json.
  const num = String(cfg.pr ?? '').match(/(\d+)\/?$/)?.[1]
  let pr
  if (num) {
    pr = { url: `https://github.com/${REACT_GH_REPO}/pull/${num}` }
    try {
      pr.title = (
        await execFileP('gh', [
          'api',
          `repos/${REACT_GH_REPO}/pulls/${num}`,
          '--jq',
          '.title',
        ])
      ).stdout.trim()
    } catch {}
  }
  cfg.runContext = {
    pr,
    arms: [],
  }
  for (const a of cfg.arms) {
    cfg.runContext.arms.push({
      name: a.name,
      title: await commitTitle(REACT_REPO_LAZY(), a.sha),
    })
  }
  printRunContext((m) => console.error(m), cfg.runContext)
  for (const arm of cfg.arms) {
    await assertCiGreen(arm.sha, arm.name, cfg.allowUngated)
    await ensureRefArm(arm)
  }
  fs.writeFileSync(
    path.join(outDir, 'meta.json'),
    JSON.stringify(
      {
        base: cfg.arms[0].name,
        cand: cfg.arms[1].name,
        label: cfg.label,
        suite: 'ssr',
        fixtureRef: cfg.fixtureRef,
        fixtureSha: cfg.fixtureSha,
        fixtureTouchedByPr: cfg.fixtureTouchedByPr || undefined,
        vms: cfg.vms,
        blocks: 1,
        runs: cfg.runs,
        pr: cfg.runContext.pr,
        arms: cfg.runContext.arms,
      },
      null,
      2
    )
  )
  cfg.live = makeLive(
    cfg.arms[0].name,
    ['median', 'rps'],
    (r) => `${r.route} ${r.phase}`
  )
  writeStatus({
    phase: 'building ssr snapshot',
    arms: cfg.arms.map((a) => `${a.name}=${a.sha.slice(0, 12)}`),
  })
  const snap = await ensureSsrSnapshot(cfg)
  writeStatus({ phase: 'measuring', snap })
  await Promise.all(
    Array.from({ length: cfg.vms }, (_, i) => runVm(i, cfg, snap, outDir))
  )
  writeStatus({ phase: 'analyzing' })
  console.error(`results in ${outDir}`)
  analyze(cfg, outDir)
  writeStatus({ phase: 'done' })
} catch (err) {
  writeStatus({
    phase: 'failed',
    error: String((err && err.message) || err).slice(0, 500),
  })
  throw err
} finally {
  clearInterval(digest)
}
