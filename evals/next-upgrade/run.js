#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync, spawnSync } = require('node:child_process')
const root = path.resolve(__dirname, '../..')
const cases = ['same-major', 'major-migration', 'existing-pr', 'lookup-blocked']
const selected = process.argv.slice(2)
if (selected.some((name) => !cases.includes(name)))
  throw new Error(`Select only: ${cases.join(', ')}`)
const tarballs = path.join(__dirname, '.tarballs')
fs.mkdirSync(tarballs, { recursive: true })
function pack(name, output) {
  const packageDirectory = path.join(root, 'packages', name)
  const entry = name === 'next' ? 'dist/bin/next' : 'bin/next-codemod.js'
  if (!fs.existsSync(path.join(packageDirectory, entry)))
    throw new Error(
      `Build packages/${name} before running upgrade evals; local output is missing.`
    )
  const text = execFileSync('pnpm', ['pack', '--pack-destination', tarballs], {
    cwd: packageDirectory,
    encoding: 'utf8',
  })
  const filename = text.trim().split('\n').pop()
  const packed = path.isAbsolute(filename)
    ? filename
    : path.join(tarballs, filename)
  const destination = path.join(tarballs, output)
  if (packed !== destination) fs.renameSync(packed, destination)
  return destination
}
const env = {
  ...process.env,
  NEXT_UPGRADE_EVAL_NEXT_TARBALL: pack('next', 'next.tgz'),
  NEXT_UPGRADE_EVAL_CODEMOD_TARBALL: pack('next-codemod', 'codemod.tgz'),
}
// agent-eval reads env files from its own cwd. Reuse the root eval setup,
// while preserving any environment files configured for this suite.
for (const filename of ['.env.local', '.env']) {
  const source = path.join(root, filename)
  if (!fs.existsSync(source)) continue
  try {
    fs.symlinkSync(source, path.join(__dirname, filename))
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
  }
}
const runner = path.join(root, 'node_modules/.bin/agent-eval')
const results = []
for (const harness of ['codex', 'claude']) {
  for (const scenario of selected.length ? selected : cases) {
    const harnessResults = path.join(__dirname, 'results', harness)
    const previous = new Set(
      fs.existsSync(harnessResults) ? fs.readdirSync(harnessResults) : []
    )
    const started = new Date().toISOString()
    const result = spawnSync(
      runner,
      ['run', harness, '--force', '--ack-failures'],
      {
        cwd: __dirname,
        env: { ...env, NEXT_UPGRADE_EVAL_CASE: scenario },
        stdio: 'inherit',
        timeout: 1500000,
      }
    )
    // The framework prunes older duplicates. Preserve each new attempt before
    // a later invocation can remove its transcript and grading evidence.
    const archives = []
    if (fs.existsSync(harnessResults)) {
      for (const timestamp of fs.readdirSync(harnessResults)) {
        if (previous.has(timestamp)) continue
        const source = path.join(harnessResults, timestamp)
        if (!fs.statSync(source).isDirectory()) continue
        const archive = path.join(
          __dirname,
          'results',
          'archive',
          `invocation-${process.pid}`,
          harness,
          timestamp
        )
        fs.cpSync(source, archive, { recursive: true })
        archives.push(path.relative(__dirname, archive))
      }
    }
    results.push({
      harness,
      scenario,
      started,
      finished: new Date().toISOString(),
      exitCode: result.status,
      error: result.error?.message,
      archives,
    })
    fs.mkdirSync(path.join(__dirname, 'results'), { recursive: true })
    fs.writeFileSync(
      path.join(__dirname, 'results', `invocations-${process.pid}.json`),
      JSON.stringify(results, null, 2)
    )
    if (result.error || result.status !== 0) process.exitCode = 1
  }
}
