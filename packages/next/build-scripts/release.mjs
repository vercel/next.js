#!/usr/bin/env node
// Full release build: precompile → (compile → bundle → post-bundle) ∥ types ∥ check-errors.
// The critical-path savings come from running types alongside the compile chain instead of after it.

import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PKG_ROOT = path.resolve(__dirname, '..')

function runNode(scriptRelPath, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, scriptRelPath), ...args], {
      cwd: PKG_ROOT,
      stdio: 'inherit',
    })
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${scriptRelPath} exited with ${code}`))
    })
    child.on('error', reject)
  })
}

function runPnpm(script) {
  return new Promise((resolve, reject) => {
    const child = spawn('pnpm', ['run', script], {
      cwd: PKG_ROOT,
      stdio: 'inherit',
      shell: false,
    })
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`pnpm run ${script} exited with ${code}`))
    })
    child.on('error', reject)
  })
}

async function writeBuildCommit() {
  // Matches the tail of taskfile.js's `build` task. Tests rely on this marker
  // to detect stale builds.
  try {
    const stdout = await new Promise((resolve, reject) => {
      const child = spawn('git', ['rev-parse', 'HEAD'], { cwd: PKG_ROOT })
      let out = ''
      child.stdout.on('data', (d) => (out += d))
      child.on('exit', (code) =>
        code === 0 ? resolve(out) : reject(new Error(`git exited ${code}`))
      )
      child.on('error', reject)
    })
    await fs.writeFile(path.join(PKG_ROOT, 'dist', '.build-commit'), stdout.trim())
  } catch (err) {
    console.warn(`Could not write build commit hash: ${err.message}`)
  }
}

async function main() {
  const start = Date.now()

  // Phase 1: precompile (copies, polyfills, styled-jsx assets, docs, skills).
  // Nothing else can run in parallel with this because compile depends on dist/compiled/**.
  const t0 = Date.now()
  await runNode('precompile.mjs')
  console.log(`[release] precompile: ${Date.now() - t0}ms`)

  // Phase 2: three parallel strands.
  //   a) compile → bundle → post-bundle  (writes dist/**/*.js, rspack runtime bundles, vendored refresh/font)
  //   b) types                            (writes dist/**/*.d.ts)
  //   c) check-errors                     (no outputs; fails fast on new uncoded errors)
  const compileChain = (async () => {
    const c0 = Date.now()
    await runNode('compile.mjs')
    console.log(`[release] compile: ${Date.now() - c0}ms`)
    const b0 = Date.now()
    await runNode('bundle.mjs')
    console.log(`[release] bundle: ${Date.now() - b0}ms`)
    const p0 = Date.now()
    await runNode('post-bundle.mjs')
    console.log(`[release] post-bundle: ${Date.now() - p0}ms`)
  })()

  const types = (async () => {
    const t0 = Date.now()
    await runPnpm('build:types')
    console.log(`[release] types: ${Date.now() - t0}ms`)
  })()

  const checkErrors = (async () => {
    const t0 = Date.now()
    await runPnpm('build:check-errors')
    console.log(`[release] check-errors: ${Date.now() - t0}ms`)
  })()

  await Promise.all([compileChain, types, checkErrors])

  await writeBuildCommit()

  console.log(`[release] TOTAL: ${Date.now() - start}ms`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
