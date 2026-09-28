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
import fs from 'fs'
import os from 'os'
import path from 'path'
import { analyzeE2eRows, tTestP } from './bench-stats.mjs'
import { openDb, importRun, loadRows, verify as verifyDb } from './bench-db.mjs'
import {
  execFileP,
  CONFIG,
  NEXT_REPO_LAZY,
  REACT_REPO_LAZY,
  CACHE,
  SETUP_VERSION,
  REACT_GH_REPO,
  NEXT_GH_REPO,
  status,
  writeStatus,
  sb,
  sbCpToVm,
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

// Runtime provenance: the compiled server files prod app-page runtimes
// are bundled from — BOTH bundlers, so changes touching only one still
// move the fingerprint. One file per server-side React layer (Flight,
// Fizz, shared react-server runtime): a change confined to one layer
// leaves the other layers' files byte-identical.
const FP_FILES = [
  'packages/next/dist/compiled/react-server-dom-turbopack-experimental/cjs/react-server-dom-turbopack-server.node.production.js',
  'packages/next/dist/compiled/react-server-dom-webpack-experimental/cjs/react-server-dom-webpack-server.node.production.js',
  'packages/next/dist/compiled/react-dom-experimental/cjs/react-dom-server.node.production.js',
  'packages/next/dist/compiled/react-experimental/cjs/react.react-server.production.js',
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

// Normalize every mode into two arms of {name, ref (react), nextRef};
// exactly one side differs between the arms.
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
// ------------------------------------------------------------ snapshots

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
    vms: { ...status.state.vms, [vm]: { state: 'booting', rows: 0 } },
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
# Identical fingerprints can be legitimate (arms differing only in
# files outside FP_FILES, e.g. client-only changes), so warn, not fail.
if [ "$FP_${base}" = "$FP_${cand}" ]; then
  echo "WARNING: arms fingerprint identically ($FP_${base}) — the hashed server bundles are byte-identical; verify the arms differ where intended"
fi
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
            ...status.state.vms,
            [vm]: { state: 'measuring', rows: vmRows },
          },
        })
        cfg.live(index, row)
      },
      110
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
      // Profiled passes run strictly AFTER the timed runs — profiling
      // overhead must never touch the numbers.
      // Within one VM the second arm runs warmer (page cache, CPU
      // governor) — a uniform few-percent deflation of every function
      // in its profile. Alternating order across VMs cancels the drift
      // in cross-VM aggregates.
      const profOrder = index % 2 === 1 ? `${cand} ${base}` : `${base} ${cand}`
      const prof = `set -e
for arm in ${profOrder}; do
  if [ "$arm" = "${base}" ]; then PORT=3720; else PORT=3721; fi
  cd /vercel/sandbox/next-$arm
  pnpm bench:render-pipeline ${benchArgs('--capture-cpu')} \
    --json-out=/tmp/pr.json --artifact-dir=/vercel/sandbox/prof-$arm >/tmp/prof.log 2>&1 \
    || (tail -10 /tmp/prof.log; exit 1)
  echo "profiled $arm"
done
# Lets profile analysis split by capture order without re-deriving it
# from VM index parity.
echo "${profOrder}" > /vercel/sandbox/prof-order.txt
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

// -------------------------------------------------------------- analyze

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
status.file = path.join(outDir, 'status.json')
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
  if (interimRows.length === 0 || !status.state.arms) return ''
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
  if (cfg.prepare) {
    // A prepare run launches no measurement VMs; anything but a
    // terminal phase here makes bench-status prescribe collecting
    // data that never existed.
    writeStatus({ phase: 'prepared (caches only, no measurement)', expSnap })
    console.error(
      `prepared: arms + experiment snapshot ${expSnap}; exiting (--prepare)`
    )
    process.exit(0)
  }
  writeStatus({
    phase: 'measuring',
    expSnap,
    rowsExpected:
      cfg.vms * cfg.blocks * cfg.runs * 2 * cfg.routes.split(',').length * 2,
  })
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
