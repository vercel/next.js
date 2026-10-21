const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { createHash } = require('node:crypto')
const repo = path.resolve(__dirname, '../../..')
const source = path.join(__dirname, 'fixtures/case-result-foreign')
const typed = path.join(__dirname, 'fixtures/reporter-packages')
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))
const digest = (file) =>
  createHash('sha256').update(fs.readFileSync(file)).digest('hex')

async function run(root, mode, specifier) {
  const env = { ...process.env, NODE_ENV: mode, NEXT_TELEMETRY_DISABLED: '1' }
  delete env.CI
  const child = spawn(
    process.execPath,
    [
      path.join(repo, 'packages/next/dist/bin/next'),
      'test',
      root,
      '--merge-reports=./blobs',
      '--reporter=' + specifier,
      '--reporter=json',
      '--outputFile=merged.json',
    ],
    { cwd: root, env, detached: process.platform !== 'win32' }
  )
  let stdout = '',
    stderr = '',
    closed = false,
    timer
  child.stdout.on('data', (data) => (stdout += data))
  child.stderr.on('data', (data) => (stderr += data))
  const completion = new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (code, signal) => {
      closed = true
      resolve({ code, signal })
    })
  })
  try {
    const ended = await Promise.race([
      completion,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Package reporter merge did not close')),
          35000
        )
      }),
    ])
    assert.equal(ended.signal, null)
    return { ...ended, stdout, stderr }
  } finally {
    clearTimeout(timer)
    if (!closed) {
      if (process.platform === 'win32') child.kill('SIGTERM')
      else process.kill(-child.pid, 'SIGTERM')
      await Promise.race([
        completion,
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('Package reporter cleanup did not close')),
            10000
          )
        }),
      ]).finally(() => clearTimeout(timer))
    }
  }
}

async function main() {
  const profiles = ['development', 'production'].flatMap((mode) =>
    ['conditional-esm', 'commonjs', 'subpath', 'unscoped'].map((kind) => ({
      mode,
      kind,
      specifier:
        (kind === 'unscoped'
          ? 'next-testing-reporter-package'
          : '@next-testing/reporter-' + kind) +
        (kind === 'subpath' ? '/custom' : ''),
      name: mode + '-' + kind,
    }))
  )
  let callbacks = 0,
    fullRows = 0
  for (const { mode, kind, specifier, name } of profiles) {
    const root = fs.mkdtempSync(path.join(repo, '.next-test-package-reporter-'))
    try {
      fs.mkdirSync(path.join(root, 'blobs'))
      const blob = path.join(source, 'development.blob')
      const blobPath = path.join(root, 'blobs/actual.blob')
      fs.copyFileSync(blob, blobPath)
      function copySources(directory, target) {
        fs.mkdirSync(target, { recursive: true })
        for (const entry of fs.readdirSync(directory, {
          withFileTypes: true,
        })) {
          const from = path.join(directory, entry.name)
          const to = path.join(target, entry.name.replace(/\.txt$/, ''))
          if (entry.isDirectory()) copySources(from, to)
          else fs.copyFileSync(from, to)
        }
      }
      const packageName =
        kind === 'unscoped' ? specifier : '@next-testing/reporter-' + kind
      copySources(
        path.join(typed, kind),
        path.join(root, 'node_modules', packageName)
      )
      fs.writeFileSync(
        path.join(root, 'package.json'),
        '{"private":true,"type":"module"}\n'
      )
      fs.writeFileSync(
        path.join(root, 'next.config.mjs'),
        'export default {}\n'
      )
      const before = new Map()
      function retainInputs(directory) {
        for (const entry of fs.readdirSync(directory, {
          withFileTypes: true,
        })) {
          const file = path.join(directory, entry.name)
          if (entry.isDirectory()) retainInputs(file)
          else before.set(file, digest(file))
        }
      }
      retainInputs(root)
      const result = await run(root, mode, specifier)
      const evidence = process.env.NEXT_TESTING_REPORTER_PACKAGE_EVIDENCE
      if (evidence) {
        const dest = path.join(evidence, name)
        fs.mkdirSync(dest, { recursive: true })
        for (const file of ['rows.json', 'merged.json'])
          if (fs.existsSync(path.join(root, file)))
            fs.copyFileSync(path.join(root, file), path.join(dest, file))
        fs.writeFileSync(
          path.join(dest, 'outcome.json'),
          JSON.stringify(result)
        )
      }
      assert.equal(result.code, 1, result.stdout + result.stderr)
      const rows = read(path.join(root, 'rows.json'))
      assert.deepEqual(rows, read(path.join(typed, mode + '.rows.json')))
      const imported = read(path.join(root, 'merged.json'))
      assert.equal(imported.next, undefined)
      assert.equal(imported.vitest.attemptHistory, 'unavailable')
      assert.equal(imported.vitest.runBoundaries, 'unavailable')
      assert.equal(imported.vitest.environmentGraphs, 'opaque-not-restored')
      assert.deepEqual(imported.vitest.blobs[0].flatted, read(blobPath))
      const expected = read(path.join(typed, mode + '.report.json'))
      expected.startTime = imported.startTime
      for (const file of expected.testResults)
        if (
          file.assertionResults.every((test) => test.duration === undefined)
        ) {
          file.startTime = imported.startTime
          file.endTime = imported.startTime
        }
      const { vitest: foreign, ...standard } = imported
      assert.equal(foreign.version, '5.0.4')
      assert.deepEqual(standard, expected)
      for (const [file, hash] of before) assert.equal(digest(file), hash)
      assert.equal(
        fs
          .readdirSync(root)
          .some((file) => /\.(?:case|test)\.[cm]?[jt]sx?$/.test(file)),
        false
      )
      callbacks += rows.filter((row) => row.event === 'case-result').length
      fullRows += rows.length
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  }
  console.log(
    JSON.stringify({
      profiles: profiles.length,
      callbacks,
      fullRows,
      noAuthoredTests: true,
      completeForeignReports: profiles.length,
      nativeImportConditionsCommonJsSubpathAndUnscoped: true,
    })
  )
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
