#!/usr/bin/env node
// Ports three "post-bundle" tasks from taskfile.js that today run after
// next_bundle as part of compile:
//   - ncc_react_refresh_utils (taskfile.js:565-601)
//   - ncc_next_font           (taskfile.js:477-501)
//   - capsize_metrics         (taskfile.js:155-165)

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const glob = require('glob')
const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Copy react-refresh and @next/react-refresh-utils into dist/compiled, with
 * the react-refresh/runtime import path rewritten in the utils' JS.
 */
export async function ncc_react_refresh_utils() {
  // 1. react-refresh — clear and recursive-copy.
  const reactRefreshDest = path.join(PKG_ROOT, 'dist/compiled/react-refresh')
  await fs.rm(reactRefreshDest, { recursive: true, force: true })
  const reactRefreshSrc = path.dirname(
    require.resolve('react-refresh/package.json')
  )
  await fs.cp(reactRefreshSrc, reactRefreshDest, {
    recursive: true,
    force: true,
  })

  // 2. @next/react-refresh-utils/dist — clear and copy with text replacement.
  const srcDir = path.join(
    path.dirname(require.resolve('@next/react-refresh-utils/package.json')),
    'dist'
  )
  const destDir = path.join(
    PKG_ROOT,
    'dist/compiled/@next/react-refresh-utils/dist'
  )
  await fs.rm(destDir, { recursive: true, force: true })
  await fs.mkdir(destDir, { recursive: true })

  const files = glob.sync('**/*.{js,json,map}', { cwd: srcDir })

  await Promise.all(
    files.map(async (file) => {
      if (file === 'tsconfig.json') return

      const content = await fs.readFile(path.join(srcDir, file), 'utf8')
      const outputFile = path.join(destDir, file)

      await fs.mkdir(path.dirname(outputFile), { recursive: true })
      await fs.writeFile(
        outputFile,
        content.replace(
          /react-refresh\/runtime/g,
          'next/dist/compiled/react-refresh/runtime'
        )
      )
    })
  )
}

/**
 * Copy @next/font's dist/google/local subdirs into dist/compiled/@next/font
 * and write a minimal package.json.
 */
export async function ncc_next_font() {
  const destDir = path.join(PKG_ROOT, 'dist/compiled/@next/font')
  const pkgPath = require.resolve('@next/font/package.json')
  const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8'))
  const srcDir = path.dirname(pkgPath)

  await fs.rm(destDir, { recursive: true, force: true })
  await fs.mkdir(destDir, { recursive: true })

  const files = glob.sync('{dist,google,local}/**/*.{js,json,d.ts}', {
    cwd: srcDir,
  })

  await Promise.all(
    files.map(async (file) => {
      const outputFile = path.join(destDir, file)
      await fs.mkdir(path.dirname(outputFile), { recursive: true })
      await fs.cp(path.join(srcDir, file), outputFile)
    })
  )

  // Minified JSON + trailing newline to match taskr's writeJson helper default.
  await fs.writeFile(
    path.join(destDir, 'package.json'),
    JSON.stringify({
      name: '@next/font',
      license: pkg.license,
      types: pkg.types,
    }) + '\n'
  )
}

/**
 * Write the capsize metrics collection out as JSON for use by next/font.
 */
export async function capsize_metrics() {
  const {
    entireMetricsCollection,
  } = require('@capsizecss/metrics/entireMetricsCollection')
  const outputPath = path.join(PKG_ROOT, 'dist/server/capsize-font-metrics.json')
  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.writeFile(
    outputPath,
    JSON.stringify(entireMetricsCollection, null, 2)
  )
}

const tasks = {
  ncc_react_refresh_utils,
  ncc_next_font,
  capsize_metrics,
}

/**
 * Run all three tasks in parallel.
 */
export default async function runAll() {
  await Promise.all(
    Object.keys(tasks).map((name) => runTask(name))
  )
}

async function runTask(name) {
  const fn = tasks[name]
  if (!fn) {
    throw new Error(`Unknown post-bundle task: ${name}`)
  }
  const t0 = Date.now()
  await fn()
  const elapsed = Date.now() - t0
  console.log(
    `[post-bundle] ${name.padEnd(32)} ${elapsed.toString().padStart(5)}ms`
  )
}

async function main() {
  const args = process.argv.slice(2)
  const selected = args.length > 0 ? args : Object.keys(tasks)

  for (const name of selected) {
    if (!(name in tasks)) {
      console.error(`[post-bundle] unknown task: ${name}`)
      console.error(`[post-bundle] available: ${Object.keys(tasks).join(', ')}`)
      process.exit(1)
    }
  }

  const start = Date.now()
  await Promise.all(selected.map((name) => runTask(name)))
  console.log(`[post-bundle] TOTAL: ${Date.now() - start}ms`)
}

// Invoke main() when run directly (not imported).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
