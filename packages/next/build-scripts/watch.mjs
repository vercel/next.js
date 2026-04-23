#!/usr/bin/env node
// Dev watch mode. Replaces the taskr default export.
//
// Unlike taskr's watch (which re-globs the whole source directory on every
// change), we dispatch each changed file to just the variants whose glob
// matches it. That's typically 1–4 SWC invocations per save instead of
// 400+.

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

import { compileFile, PKG_ROOT } from './lib/swc.mjs'
import { variants } from './compile.mjs'

const require = createRequire(import.meta.url)
const Watchpack = require('watchpack')
const minimatch = require('minimatch')

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Precompute per-variant matcher closures so we aren't re-parsing globs on every save.
const variantMatchers = variants
  .filter((v) => !v.srcGlob.endsWith('.wasm'))
  .map((variant) => {
    const absGlob = path.join(PKG_ROOT, variant.srcGlob)
    const ignore = (variant.ignore ?? []).map((p) =>
      path.isAbsolute(p) ? p : path.join(PKG_ROOT, p)
    )
    const base = variant.srcBase
      ? path.resolve(PKG_ROOT, variant.srcBase)
      : path.resolve(PKG_ROOT, deriveBase(variant.srcGlob))
    return { variant, absGlob, ignore, base }
  })

function deriveBase(pattern) {
  const parts = pattern.split('/')
  const i = parts.findIndex(
    (p) => p.includes('*') || p.includes('?') || p.includes('[')
  )
  if (i < 0) return path.dirname(pattern)
  return parts.slice(0, i).join('/') || '.'
}

function matchesVariant(absFile, { absGlob, ignore }) {
  // Fast reject: if the file is under a different prefix, bail without minimatch.
  const globRoot = deriveBase(absGlob)
  if (!absFile.startsWith(globRoot)) return false
  if (!minimatch(absFile, absGlob, { dot: false })) return false
  for (const pat of ignore) {
    if (minimatch(absFile, pat, { dot: false })) return false
  }
  return true
}

async function compileChangedFile(absFile) {
  const destinations = []
  for (const { variant, base } of variantMatchers) {
    if (!matchesVariant(absFile, { absGlob: path.join(PKG_ROOT, variant.srcGlob), ignore: (variant.ignore ?? []).map((p) => (path.isAbsolute(p) ? p : path.join(PKG_ROOT, p))) })) {
      continue
    }
    const relFromBase = path.relative(base, absFile)
    const relDir = path.dirname(relFromBase)
    const primaryDest = path.resolve(PKG_ROOT, variant.destDir)
    const allDests = [primaryDest, ...(variant.additionalDestDirs ?? []).map((d) => path.resolve(PKG_ROOT, d))]
    for (const targetDir of allDests) {
      const destTarget = relDir === '.' ? targetDir : path.join(targetDir, relDir)
      destinations.push({ variant, destTarget })
    }
  }

  if (destinations.length === 0) return 0

  const jobs = destinations.map(({ variant, destTarget }) =>
    compileFile({
      srcFile: absFile,
      destDir: destTarget,
      serverOrClient: variant.serverOrClient,
      esm: variant.esm ?? false,
      stripExtension: variant.stripExtension ?? false,
      interopClientDefaultExport: variant.interopClientDefaultExport ?? false,
      mode: variant.mode ?? null,
    })
  )
  await Promise.all(jobs)
  return destinations.length
}

// Run an initial build so dist/ is populated, then enter watch mode.
async function initialBuild() {
  const start = Date.now()
  console.log('[watch] initial build...')
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, 'release.mjs')], {
      cwd: PKG_ROOT,
      stdio: 'inherit',
    })
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`initial build exited with ${code}`))
    })
  })
  console.log(`[watch] initial build: ${Date.now() - start}ms`)
}

// rspack has its own watch mode; delegate bundles to it once dist is seeded.
async function startBundleWatch() {
  console.log('[watch] starting bundle watchers (dev-only variants)...')
  const child = spawn(
    process.execPath,
    [
      path.join(__dirname, 'bundle.mjs'),
      '--watch',
      'next_bundle_app_dev_turbo',
      'next_bundle_pages_dev_turbo',
      'next_bundle_devtools',
    ],
    { cwd: PKG_ROOT, stdio: 'inherit' }
  )
  return child
}

// tsc --watch runs in the background and emits .d.ts incrementally.
function startTypesWatch() {
  console.log('[watch] starting tsc --watch...')
  return spawn(
    'pnpm',
    ['run', 'types', '--', '--watch', '--preserveWatchOutput'],
    { cwd: PKG_ROOT, stdio: 'inherit', shell: false }
  )
}

async function main() {
  const args = new Set(process.argv.slice(2))
  const skipInitial = args.has('--no-initial')

  if (!skipInitial) {
    // Check for a fresh dist. If .build-commit matches current HEAD, skip the
    // full build — turbo's cache should have restored things already.
    const commitFile = path.join(PKG_ROOT, 'dist', '.build-commit')
    let distIsCurrent = false
    try {
      const [headOut, distCommit] = await Promise.all([
        execGit(['rev-parse', 'HEAD']),
        fs.readFile(commitFile, 'utf8'),
      ])
      distIsCurrent = headOut.trim() === distCommit.trim()
    } catch {}

    if (distIsCurrent) {
      console.log('[watch] dist/ matches HEAD; skipping initial build')
    } else {
      await initialBuild()
    }
  }

  // Only start tsc + rspack watchers when not explicitly opted out. They're
  // the slow-start-up parts.
  const bundleWatcher = args.has('--no-bundle') ? null : await startBundleWatch()
  const typesWatcher = args.has('--no-types') ? null : startTypesWatch()

  const wp = new Watchpack({
    aggregateTimeout: 50,
    followSymlinks: false,
    ignored: ['**/.git', '**/*.test.*', '**/*.stories.*', '**/__snapshots__'],
  })
  wp.watch({
    directories: [path.join(PKG_ROOT, 'src')],
    startTime: Date.now() - 10000,
  })

  // watchpack's `aggregated` passes the WATCHED DIRECTORY paths, not individual
  // files. Collect per-file events via `change` and drain the queue shortly
  // after quiescence so we batch cleanly without re-globbing.
  const pending = new Set()
  let flushTimer = null
  const scheduleFlush = () => {
    if (flushTimer) return
    flushTimer = setTimeout(flush, 50)
  }
  async function flush() {
    flushTimer = null
    const files = [...pending]
    pending.clear()
    if (files.length === 0) return
    const start = Date.now()
    const results = await Promise.allSettled(
      files.map(async (f) => ({ file: f, count: await compileChangedFile(f) }))
    )
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.count > 0) {
        const rel = path.relative(PKG_ROOT, r.value.file)
        console.log(`[watch] ${rel} → ${r.value.count} dest(s)`)
      } else if (r.status === 'rejected') {
        console.error('[watch] failed:', r.reason?.message ?? r.reason)
      }
    }
    console.log(`[watch] batch (${files.length} file${files.length === 1 ? '' : 's'}) in ${Date.now() - start}ms`)
  }

  wp.on('change', (file) => {
    pending.add(file)
    scheduleFlush()
  })

  console.log('[watch] watching src/... (ctrl-c to exit)')

  // Keep the process alive; clean up children on exit.
  const cleanup = () => {
    if (bundleWatcher) bundleWatcher.kill()
    if (typesWatcher) typesWatcher.kill()
    wp.close()
    process.exit(0)
  }
  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)
}

function execGit(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd: PKG_ROOT })
    let stdout = ''
    child.stdout.on('data', (d) => (stdout += d))
    child.on('exit', (code) => {
      if (code === 0) resolve(stdout)
      else reject(new Error(`git exited ${code}`))
    })
    child.on('error', reject)
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
