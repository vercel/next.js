#!/usr/bin/env node
// @ts-check
/**
 * Differential self-eval for the next-dynamic-io-refactor skill.
 *
 * Thesis: a capable default agent CANNOT correctly refactor a messy
 * cacheComponents app on its own — it either fails to build, or "cheats" by
 * collapsing the whole page into one <Suspense>/loading.tsx (build passes, shell
 * is blank/coarse). WITH the skill, the same agent reaches a maximal static
 * shell. If that holds, the skill is doing real work.
 *
 * The run, on the LATEST next@canary:
 *   0. install canary once (a shared template)
 *   1. BASELINE  — `next build` the untouched messy app → expect FAILURE
 *                  (proves the "before" is genuinely broken; the differential's
 *                   floor, à la "prove the RED")
 *   2. arm NO-SKILL  — fresh copy → headless `claude -p` with a PLAIN prompt
 *                      (goal + fairness guardrails, no methodology) → build → score
 *   3. arm WITH-SKILL — fresh copy → headless `claude -p` pointed at this skill
 *                      → build → score
 *   4. VERDICT — the skill is differentiating iff WITH-SKILL passes the maximal-
 *                shell bar and NO-SKILL does not.
 *
 * Quality is scored STATICALLY (re-run scan.mjs on the result + parse the build
 * route table) — no browser, no instant() rig. See README.md.
 *
 * Usage:
 *   node run.mjs                      full differential (both arms)
 *   node run.mjs --baseline-only      just prove the messy app fails to build
 *   node run.mjs --arm with-skill     run a single arm
 *   node run.mjs --skip-install       reuse an existing template (faster reruns)
 *   node run.mjs --model opus         pass a model to claude -p
 *   node run.mjs --keep               keep the work dir for inspection
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SKILL_DIR = path.resolve(HERE, '..')
const MESSY_SRC = path.join(HERE, 'messy-app')
const SCAN = path.join(SKILL_DIR, 'scan.mjs')

const argv = process.argv.slice(2)
const has = (f) => argv.includes(f)
const val = (f, d) => {
  const i = argv.indexOf(f)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d
}
const ONLY_ARM = val('--arm', null) // 'no-skill' | 'with-skill' | null(both)
const BASELINE_ONLY = has('--baseline-only')
const SKIP_INSTALL = has('--skip-install')
const KEEP = has('--keep')
const RESCORE = val('--rescore', null) // re-evaluate an existing work dir (no claude/install)
const MODEL = val('--model', null)
const WORK = val('--work', null)
// Which next to install. Default 'canary' (latest). NOTE: 16.3.0-canary.41
// regressed Cache Components builds (workStore invariant prerendering the
// internal /_not-found and /_global-error pages — any cacheComponents app fails).
// Pin a known-good build with e.g. `--next 16.3.0-canary.40` until the fix lands.
const NEXT_VER = val('--next', 'canary')

// Failure signatures of the cacheComponents build oracle (the actual canary
// error text, verified empirically). Exit code is the primary signal; this is a
// guard against a soft "exit 0 but warned" pass.
const DYNAMIC_IO_ERROR =
  /encountered uncached or runtime data|Error occurred prerendering|accessed outside of .?<Suspense|Export encountered an error|must return at least one|exited with code: 1/i

function sh(cmd, opts = {}) {
  const r = spawnSync(cmd, {
    shell: true,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    ...opts,
  })
  return { code: r.status ?? 1, out: (r.stdout || '') + (r.stderr || '') }
}
const q = (p) => JSON.stringify(p) // cross-shell path quoting

// Copy SOURCE only — never node_modules (cp of node_modules breaks Next's
// internal relative requires) and never .next (build cache).
function copySource(src, dest) {
  fs.cpSync(src, dest, {
    recursive: true,
    filter: (s) => {
      const b = path.basename(s)
      return b !== 'node_modules' && b !== '.next'
    },
  })
}

// Share the one install via a symlink/junction instead of copying it.
function linkModules(template, dest) {
  const from = path.join(template, 'node_modules')
  const to = path.join(dest, 'node_modules')
  if (fs.existsSync(from) && !fs.existsSync(to)) {
    fs.symlinkSync(from, to, process.platform === 'win32' ? 'junction' : 'dir')
  }
}

function nextBuild(dir) {
  const log = path.join(dir, 'build.log')
  const { code, out } = sh(`npx --no-install next build`, { cwd: dir })
  fs.writeFileSync(log, out)
  const builds = code === 0 && !DYNAMIC_IO_ERROR.test(out)
  return { builds, code, out, log }
}

// Does any non-comment line in the app's source (app/ + lib/ + components/ …,
// not node_modules/.next) match `re`? Used to find directives/APIs that live
// outside the route tree (e.g. a cached data layer in lib/).
function srcHas(dir, re) {
  let found = false
  const walk = (d) => {
    let ents
    try {
      ents = fs.readdirSync(d, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of ents) {
      if (found) return
      const p = path.join(d, e.name)
      if (e.isDirectory()) {
        if (!['node_modules', '.next', '.git'].includes(e.name)) walk(p)
      } else if (/\.(tsx?|jsx?|mjs)$/.test(e.name)) {
        for (const l of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
          const t = l.trim()
          if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'))
            continue
          if (re.test(l)) {
            found = true
            break
          }
        }
      }
    }
  }
  walk(dir)
  return found
}

/** Static quality score of a refactored app (higher = more maximal shell). */
function score(dir) {
  const { code, out } = sh(`node ${q(SCAN)} ${q(dir)} --json`)
  let scan = { segments: [], files: [], flags: [] }
  try {
    scan = JSON.parse(out)
  } catch {
    /* leave empty */
  }
  const cfg = readFirst(dir, [
    'next.config.ts',
    'next.config.js',
    'next.config.mjs',
  ])
  const keptCacheComponents = /cacheComponents\s*:\s*true/.test(cfg)
  const routesPresent = [
    'app/page',
    'app/blog/[slug]/page',
    'app/search/page',
    'app/dashboard/page',
  ].every((r) => existsAny(dir, [`${r}.tsx`, `${r}.ts`, `${r}.jsx`, `${r}.js`]))
  const high = scan.flags.filter((f) => f.severity === 'high').length
  const blog = scan.segments.find((s) => s.route === '/blog/[slug]')
  const gspBlog = !!blog?.hasGenerateStaticParams
  const elementFallbacks = scan.files.reduce(
    (n, f) =>
      n + (f.boundaries || []).filter((b) => b.fallback === 'element').length,
    0
  )
  // Caching often lives outside app/ (a lib/ data layer), and proper caching =
  // 'use cache' WITH a cacheLife profile and a cacheTag for invalidation. A
  // bare 'use cache' (default profile, no tag) builds but can never be
  // invalidated — the gap a strong unaided agent typically leaves.
  const usesCache = srcHas(dir, /['"]use cache(?::\s*\w+)?['"]/)
  const hasCacheLife = srcHas(dir, /\bcacheLife\s*\(/)
  const hasCacheTag = srcHas(dir, /\bcacheTag\s*\(/)

  // Tier 1 — CORRECT (maximal shell): builds, didn't cheat, no HIGH candidates,
  // enumerable param enumerated, shared data cached, ≥1 real granular fallback.
  const correct =
    keptCacheComponents &&
    routesPresent &&
    high === 0 &&
    gspBlog &&
    usesCache &&
    elementFallbacks >= 1
  // Tier 2 — QUALITY: correct AND cache lifetimes + invalidation tags present.
  const quality = correct && hasCacheLife && hasCacheTag

  return {
    keptCacheComponents,
    routesPresent,
    highFlags: high,
    gspBlog,
    usesCache,
    hasCacheLife,
    hasCacheTag,
    elementFallbacks,
    correct,
    quality,
    scanOk: code === 0,
  }
}

function readFirst(dir, names) {
  for (const n of names) {
    const p = path.join(dir, n)
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8')
  }
  return ''
}
function existsAny(dir, rels) {
  return rels.some((r) => fs.existsSync(path.join(dir, r)))
}

const PROMPT = {
  'with-skill': () =>
    `Refactor the Next.js App Router app in the current directory so it builds under ` +
    `\`cacheComponents: true\` with the LARGEST possible static shell.\n\n` +
    `A skill describing exactly how to do this is at ${SKILL_DIR}/SKILL.md ` +
    `(with analysis.md, levers.md, and scan.mjs alongside). READ ${SKILL_DIR}/SKILL.md ` +
    `and follow it. Run \`node ${SKILL_DIR}/scan.mjs .\` to inventory the dynamic-IO ` +
    `sites, apply the levers, and run \`npx next build\` to verify.\n\n` +
    `Hard constraints: (1) keep \`cacheComponents: true\` — never disable it; ` +
    `(2) do NOT make the build pass by wrapping a whole page/layout in one <Suspense> ` +
    `or a blanket loading.tsx — push boundaries DOWN to each I/O; (3) cache shared, ` +
    `non-request data with 'use cache'; enumerate enumerable route params with ` +
    `generateStaticParams; (4) keep every route rendering its real content. ` +
    `Finish when \`npx next build\` succeeds with no dynamic-IO errors.`,
  'no-skill': () =>
    `Refactor the Next.js App Router app in the current directory so that ` +
    `\`npx next build\` succeeds. The project has \`cacheComponents: true\` enabled and ` +
    `the build currently fails with dynamic-IO / Suspense / caching errors. Fix the app ` +
    `so it builds cleanly.\n\n` +
    `Constraints: keep \`cacheComponents: true\` enabled (do not disable it), and keep ` +
    `every route rendering its real content (don't delete routes or blank them out). ` +
    `Run \`npx next build\` to verify.`,
}

function runArm(arm, template) {
  const dir = path.join(template, '..', arm)
  copySource(template, dir)
  linkModules(template, dir)
  console.log(`\n── arm: ${arm} ──  (${dir})`)
  const addDir = arm === 'with-skill' ? `--add-dir ${q(SKILL_DIR)}` : ''
  const model = MODEL ? `--model ${q(MODEL)}` : ''
  const promptFile = path.join(dir, `.prompt.txt`)
  fs.writeFileSync(promptFile, PROMPT[arm]())
  console.log(`   running headless claude -p …`)
  const { code, out } = sh(
    `claude -p "$(cat ${q(promptFile)})" ${addDir} ${model} --dangerously-skip-permissions --permission-mode bypassPermissions`,
    { cwd: dir }
  )
  fs.writeFileSync(path.join(dir, 'claude.log'), out)
  if (code !== 0)
    console.log(
      `   ⚠ claude exited ${code} (see ${path.join(dir, 'claude.log')})`
    )
  const build = nextBuild(dir)
  const s = score(dir)
  return { arm, dir, claudeCode: code, build, score: s }
}

// 0 build failed · 1 builds-but-not-maximal · 2 CORRECT (maximal) · 3 QUALITY
function tierRank(r) {
  if (!r.build.builds) return 0
  if (r.score.quality) return 3
  if (r.score.correct) return 2
  return 1
}
const TIER = [
  'BUILD FAILED ❌',
  'not maximal ❌',
  'CORRECT ◐ (maximal, no profiles/tags)',
  'QUALITY ✅ (maximal + cacheLife/cacheTag)',
]

function fmtArm(r) {
  const s = r.score
  return [
    `  ${r.arm.padEnd(11)} build:${r.build.builds ? 'PASS' : 'FAIL'}`,
    `cc:${s.keptCacheComponents ? 'kept' : 'DISABLED'}`,
    `routes:${s.routesPresent ? 'all' : 'MISSING'}`,
    `HIGH:${s.highFlags}`,
    `gsp:${s.gspBlog ? 'y' : 'n'}`,
    `cache:${s.usesCache ? 'y' : 'n'}`,
    `cacheLife:${s.hasCacheLife ? 'y' : 'n'}`,
    `cacheTag:${s.hasCacheTag ? 'y' : 'n'}`,
    `granular-fb:${s.elementFallbacks}`,
    `→ ${TIER[tierRank(r)]}`,
  ].join('  ')
}

function report(base, results) {
  console.log(`\n════════ RESULTS ════════`)
  console.log(
    `  baseline    build:${base.builds ? 'PASS ⚠ (expected FAIL)' : 'FAIL ✅ (expected)'}  (untouched messy app)`
  )
  for (const r of results) console.log(fmtArm(r))

  const withS = results.find((r) => r.arm === 'with-skill')
  const noS = results.find((r) => r.arm === 'no-skill')
  console.log(`\n════════ VERDICT ════════`)
  if (withS && noS) {
    const w = tierRank(withS)
    const n = tierRank(noS)
    if (w > n) {
      console.log(
        `✅ SKILL IS DIFFERENTIATING — with-skill reached "${TIER[w]}", no-skill only "${TIER[n]}".`
      )
    } else if (w === n && w === 3) {
      console.log(
        `➖ Both arms reached QUALITY — skill not differentiated on THIS fixture. Add a harder trap.`
      )
    } else if (w === n) {
      console.log(
        `➖ No gap on this fixture — both at "${TIER[w]}". Strengthen the rubric or fixture.`
      )
    } else {
      console.log(
        `❌ Unexpected — no-skill ("${TIER[n]}") beat with-skill ("${TIER[w]}").`
      )
    }
  } else {
    for (const r of results) console.log(`  ${r.arm}: ${TIER[tierRank(r)]}`)
  }
}

function main() {
  console.log(`next-dynamic-io-refactor :: differential self-eval`)
  const resolved =
    NEXT_VER === 'canary'
      ? sh(`npm view next@canary version`).out.trim().split('\n').pop()
      : NEXT_VER
  console.log(
    `next = ${NEXT_VER}${NEXT_VER === 'canary' ? ` (${resolved})` : ''}`
  )
  if (/canary\.41$/.test(resolved || '')) {
    console.log(
      `  ⚠ canary.41 regressed Cache Components builds (workStore invariant on internal pages).\n` +
        `    Re-run with a known-good pin: --next 16.3.0-canary.40`
    )
  }

  const workRoot = WORK || fs.mkdtempSync(path.join(os.tmpdir(), 'ndio-eval-'))
  const template = path.join(workRoot, '_template')
  console.log(`work dir: ${workRoot}`)

  const needInstall =
    !SKIP_INSTALL || !fs.existsSync(path.join(template, 'node_modules'))
  copySource(MESSY_SRC, template) // always refresh source (cheap) so reruns aren't stale
  const pkgPath = path.join(template, 'package.json')
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
  pkg.dependencies.next = NEXT_VER
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2))
  if (needInstall) {
    console.log(`installing next@${NEXT_VER} (one-time)…`)
    const inst = sh(`npm install --no-audit --no-fund --legacy-peer-deps`, {
      cwd: template,
    })
    if (inst.code !== 0) {
      console.error(`npm install failed:\n${inst.out.slice(-2000)}`)
      process.exit(1)
    }
  }

  // 1. BASELINE — the untouched messy app must FAIL the build.
  const baseDir = path.join(workRoot, 'baseline')
  copySource(template, baseDir)
  linkModules(template, baseDir)
  const base = nextBuild(baseDir)
  console.log(
    `\n── baseline (untouched messy app) ──  build: ${base.builds ? 'PASS ⚠ (expected FAIL!)' : 'FAIL ✅ (expected)'}`
  )
  if (base.builds) {
    console.log(
      `  The messy fixture built without the refactor — the differential has no floor. ` +
        `Check that you're on a recent canary and that cacheComponents is on.`
    )
  }
  if (BASELINE_ONLY) {
    console.log(`\n--baseline-only: done. Build log: ${base.log}`)
    if (!KEEP) console.log(`(work dir kept for inspection: ${workRoot})`)
    return
  }

  // 2 & 3. the two arms
  const arms = ONLY_ARM ? [ONLY_ARM] : ['no-skill', 'with-skill']
  const results = arms.map((a) => runArm(a, template))

  // 4. report + verdict
  report(base, results)
  console.log(`\nwork dir (logs + refactored code per arm): ${workRoot}`)
}

// Re-evaluate existing arm outputs (rebuild + re-score) without re-running
// claude. Use after editing the scorer/scan to recheck a prior run's code.
function rescore(workRoot) {
  console.log(`re-scoring ${workRoot} (no claude, no install)\n`)
  const baseDir = path.join(workRoot, 'baseline')
  const base = fs.existsSync(baseDir) ? nextBuild(baseDir) : { builds: false }
  const results = ['no-skill', 'with-skill']
    .filter((a) => fs.existsSync(path.join(workRoot, a)))
    .map((arm) => {
      const dir = path.join(workRoot, arm)
      return { arm, dir, build: nextBuild(dir), score: score(dir) }
    })
  report(base, results)
}

if (RESCORE) rescore(RESCORE)
else main()
