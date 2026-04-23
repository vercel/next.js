#!/usr/bin/env node
// Port of taskfile.js `precompile` task and its five children.
// Everything here is pure file copying; no SWC involved.

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

import { copyDir } from './lib/copy.mjs'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PKG_ROOT = path.resolve(__dirname, '..')

export async function next__polyfill_nomodule() {
  const src = require.resolve('@next/polyfill-nomodule')
  const dest = path.join(PKG_ROOT, 'dist/build/polyfills', path.basename(src))
  await fs.mkdir(path.dirname(dest), { recursive: true })
  await fs.copyFile(src, dest)
}

export async function next__polyfill_module() {
  const src = require.resolve('@next/polyfill-module')
  const dest = path.join(PKG_ROOT, 'dist/build/polyfills', path.basename(src))
  await fs.mkdir(path.dirname(dest), { recursive: true })
  await fs.copyFile(src, dest)
}

export async function browser_polyfills() {
  await Promise.all([next__polyfill_nomodule(), next__polyfill_module()])
}

export async function copy_ncced() {
  // Pre-ncced vendor bundles are committed under src/compiled to skip ncc on
  // every build. Just mirror the tree into dist/.
  await copyDir(
    path.join(PKG_ROOT, 'src/compiled'),
    path.join(PKG_ROOT, 'dist/compiled')
  )
}

export async function copy_styled_jsx_assets() {
  // Ship styled-jsx types alongside Next's dist so next-env.d.ts can reference
  // them regardless of hoisting. Keep them in a `types/` subdir to avoid the
  // duplicated `declare module` collision against the dev-dep copy.
  const styledJsxPath = path.dirname(require.resolve('styled-jsx/package.json'))
  const typesDir = path.join(PKG_ROOT, 'dist/styled-jsx/types')
  await fs.mkdir(typesDir, { recursive: true })
  const entries = await fs.readdir(styledJsxPath, { withFileTypes: true })
  await Promise.all(
    entries
      .filter((e) => e.isFile() && e.name.endsWith('.d.ts'))
      .map(async (e) => {
        const contents = await fs.readFile(path.join(styledJsxPath, e.name), 'utf8')
        await fs.writeFile(path.join(typesDir, e.name), contents)
      })
  )
}

export async function copy_docs() {
  // Rename .mdx → .md on the way so AI agents find them when globbing for *.md.
  const docsSource = path.resolve(PKG_ROOT, '../../docs')
  await copyDir(docsSource, path.join(PKG_ROOT, 'dist/docs'), {
    rename: (rel) => (rel.endsWith('.mdx') ? rel.replace(/\.mdx$/, '.md') : rel),
  })
}

export async function copy_skills() {
  const skillsSource = path.resolve(PKG_ROOT, '../../skills')
  await copyDir(skillsSource, path.join(PKG_ROOT, 'dist/skills'))
}

export async function precompile() {
  const tasks = [
    ['browser_polyfills', browser_polyfills],
    ['copy_ncced', copy_ncced],
    ['copy_styled_jsx_assets', copy_styled_jsx_assets],
    ['copy_docs', copy_docs],
    ['copy_skills', copy_skills],
  ]
  await Promise.all(
    tasks.map(async ([name, fn]) => {
      const t0 = Date.now()
      await fn()
      console.log(`[precompile] ${name.padEnd(24)} ${(Date.now() - t0).toString().padStart(5)}ms`)
    })
  )
}

const TASKS = {
  precompile,
  browser_polyfills,
  next__polyfill_nomodule,
  next__polyfill_module,
  copy_ncced,
  copy_styled_jsx_assets,
  copy_docs,
  copy_skills,
}

async function main() {
  const args = process.argv.slice(2)
  const names = args.length ? args : ['precompile']
  const start = Date.now()
  for (const name of names) {
    const fn = TASKS[name]
    if (!fn) {
      console.error(`[precompile] unknown task: ${name}`)
      process.exit(1)
    }
    const t0 = Date.now()
    await fn()
    console.log(`[precompile] ${name.padEnd(24)} ${(Date.now() - t0).toString().padStart(5)}ms (top-level)`)
  }
  console.log(`[precompile] TOTAL: ${Date.now() - start}ms`)
}

// Only run when invoked directly; safe to also import as a module.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
