const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const repo = path.resolve(__dirname, '../../..')
const source = path.join(__dirname, 'fixtures/case-result-cohort')
const pristine = path.join(__dirname, 'fixtures/case-result-blob')
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))
async function run(root, args, mode) {
  const env = { ...process.env, NODE_ENV: mode, NEXT_TELEMETRY_DISABLED: '1' }
  delete env.CI
  const child = spawn(
    process.execPath,
    [path.join(repo, 'packages/next/dist/bin/next'), 'test', root, ...args],
    {
      cwd: root,
      env,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  )
  let stdout = '',
    stderr = '',
    closed = false,
    timer
  child.stdout.on('data', (data) => {
    stdout += data
  })
  child.stderr.on('data', (data) => {
    stderr += data
  })
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
          () => reject(new Error('Actual blob reporter phase did not close')),
          40000
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
            () => reject(new Error('Blob reporter cleanup did not close')),
            5000
          )
        }),
      ]).finally(() => clearTimeout(timer))
    }
  }
}
async function main() {
  for (const [mode, cohort] of [
    ['development', false],
    ['production', false],
    ['development', true],
  ]) {
    const label = mode + (cohort ? '-cohort' : ''),
      root = fs.mkdtempSync(path.join(repo, '.next-test-blob-replay-'))
    try {
      for (const name of ['first.test.mjs', 'second.test.mjs', 'reporter.mjs'])
        fs.copyFileSync(path.join(source, name + '.txt'), path.join(root, name))
      const authored = Object.fromEntries(
        ['first.test.mjs', 'second.test.mjs', 'reporter.mjs'].map((name) => [
          name,
          fs.readFileSync(path.join(root, name)),
        ])
      )
      fs.writeFileSync(
        path.join(root, 'package.json'),
        '{"private":true,"type":"module"}\n'
      )
      fs.writeFileSync(
        path.join(root, 'next.config.mjs'),
        'export default {}\n'
      )
      fs.writeFileSync(
        path.join(root, 'next.test.config.json'),
        JSON.stringify({
          projects: [
            {
              name: 'case-rejection',
              environment: 'node',
              mode,
              include: ['*.test.mjs'],
              isolate: !cohort,
            },
          ],
        })
      )
      const record = await run(
        root,
        [
          '--run',
          '--maxWorkers=1',
          '--reporter=./reporter.mjs',
          '--reporter=blob',
          '--outputFile=blobs/actual.json',
        ],
        mode
      )
      assert.equal(record.code, 1, record.stdout + record.stderr)
      const live = read(path.join(root, 'rows.json')),
        blob = read(path.join(root, 'blobs/actual.json'))
      assert.deepEqual(
        live,
        read(path.join(source, 'pristine-' + label + '.json'))
      )
      assert.equal(blob.kind, 'next-test-results')
      assert.equal(
        blob.events.filter((event) => event.type === 'file-collected').length,
        2
      )
      assert.equal(
        blob.events.filter((event) => event.type === 'case-end').length,
        2
      )
      assert.equal(
        blob.events.filter((event) => event.type === 'file-end').length,
        2
      )
      assert.equal(blob.reporterErrors.length, 1)
      assert.equal(blob.reporterErrors[0].name, 'Error')
      assert.equal(blob.reporterErrors[0].message, 'case result hook rejected')
      const mergedRoot = path.join(root, 'merge-without-tests')
      fs.mkdirSync(mergedRoot)
      fs.mkdirSync(path.join(mergedRoot, 'blobs'))
      fs.copyFileSync(
        path.join(root, 'blobs/actual.json'),
        path.join(mergedRoot, 'blobs/actual.json')
      )
      fs.copyFileSync(
        path.join(root, 'reporter.mjs'),
        path.join(mergedRoot, 'reporter.mjs')
      )
      fs.writeFileSync(
        path.join(mergedRoot, 'package.json'),
        '{"private":true,"type":"module"}\n'
      )
      const merged = await run(
        mergedRoot,
        [
          '--merge-reports=blobs',
          '--reporter=./reporter.mjs',
          '--reporter=json',
          '--outputFile=merged.json',
        ],
        mode
      )
      assert.equal(merged.code, 1, merged.stdout + merged.stderr)
      const rows = read(path.join(mergedRoot, 'rows.json')),
        report = read(path.join(mergedRoot, 'merged.json'))
      assert.deepEqual(
        rows,
        read(path.join(pristine, 'pristine-' + label + '.json'))
      )
      assert.equal(report.success, true)
      assert.equal(report.numTotalTests, 2)
      assert.equal(report.numPassedTests, 2)
      assert.equal(report.numFailedTests, 0)
      assert(
        report.testResults.every((file) =>
          file.name.startsWith(mergedRoot + path.sep)
        )
      )
      assert.equal(
        fs.readdirSync(mergedRoot).filter((file) => file.endsWith('.test.mjs'))
          .length,
        0
      )
      const plain = await run(
        mergedRoot,
        ['--merge-reports=blobs', '--reporter=json', '--outputFile=plain.json'],
        mode
      )
      assert.equal(plain.code, 1, plain.stdout + plain.stderr)
      assert.equal(read(path.join(mergedRoot, 'plain.json')).numPassedTests, 2)
      const junit = await run(
        mergedRoot,
        [
          '--merge-reports=blobs',
          '--reporter=junit',
          '--outputFile=report.xml',
        ],
        mode
      )
      assert.equal(junit.code, 1, junit.stdout + junit.stderr)
      assert.equal(
        (
          fs
            .readFileSync(path.join(mergedRoot, 'report.xml'), 'utf8')
            .match(/<testcase /g) || []
        ).length,
        2
      )
      assert.equal(
        fs
          .readFileSync(path.join(mergedRoot, 'report.xml'), 'utf8')
          .includes('<failure'),
        false
      )
      const soloRoot = path.join(root, 'blob-only')
      fs.mkdirSync(soloRoot)
      for (const name of ['first.test.mjs', 'reporter.mjs'])
        fs.copyFileSync(path.join(root, name), path.join(soloRoot, name))
      fs.writeFileSync(
        path.join(soloRoot, 'package.json'),
        '{"private":true,"type":"module"}\n'
      )
      fs.writeFileSync(
        path.join(soloRoot, 'next.config.mjs'),
        'export default {}\n'
      )
      fs.writeFileSync(
        path.join(soloRoot, 'next.test.config.json'),
        JSON.stringify({
          projects: [
            {
              name: 'case-rejection',
              environment: 'node',
              mode,
              include: ['first.test.mjs'],
              isolate: !cohort,
            },
          ],
        })
      )
      const soloRecord = await run(
        soloRoot,
        [
          '--run',
          '--maxWorkers=1',
          '--reporter=blob',
          '--outputFile=blobs/actual.json',
        ],
        mode
      )
      assert.equal(soloRecord.code, 0, soloRecord.stdout + soloRecord.stderr)
      const soloBlob = read(path.join(soloRoot, 'blobs/actual.json'))
      assert.equal(
        soloBlob.events.filter((event) => event.type === 'file-collected')
          .length,
        1
      )
      assert.equal(
        soloBlob.events.filter((event) => event.type === 'case-end').length,
        1
      )
      assert.equal(soloBlob.reporterErrors, undefined)
      const soloMergeRoot = path.join(soloRoot, 'merge-without-tests')
      fs.mkdirSync(soloMergeRoot)
      fs.mkdirSync(path.join(soloMergeRoot, 'blobs'))
      fs.copyFileSync(
        path.join(soloRoot, 'blobs/actual.json'),
        path.join(soloMergeRoot, 'blobs/actual.json')
      )
      fs.copyFileSync(
        path.join(soloRoot, 'reporter.mjs'),
        path.join(soloMergeRoot, 'reporter.mjs')
      )
      fs.writeFileSync(
        path.join(soloMergeRoot, 'package.json'),
        '{"private":true,"type":"module"}\n'
      )
      const soloMerge = await run(
        soloMergeRoot,
        [
          '--merge-reports=blobs',
          '--reporter=./reporter.mjs',
          '--reporter=json',
          '--outputFile=merged.json',
        ],
        mode
      )
      assert.equal(soloMerge.code, 1, soloMerge.stdout + soloMerge.stderr)
      assert.deepEqual(
        read(path.join(soloMergeRoot, 'rows.json')),
        read(path.join(pristine, 'default-pristine-' + label + '.json'))
      )
      assert.equal(
        read(path.join(soloMergeRoot, 'merged.json')).numPassedTests,
        1
      )
      const soloPlain = await run(
        soloMergeRoot,
        ['--merge-reports=blobs', '--reporter=json', '--outputFile=plain.json'],
        mode
      )
      assert.equal(soloPlain.code, 0, soloPlain.stdout + soloPlain.stderr)
      assert.equal(
        read(path.join(soloMergeRoot, 'plain.json')).numPassedTests,
        1
      )
      for (const [name, bytes] of Object.entries(authored))
        assert.deepEqual(fs.readFileSync(path.join(root, name)), bytes)
      if (process.env.NEXT_TESTING_BLOB_REPORTER_EVIDENCE) {
        const target = path.join(
          process.env.NEXT_TESTING_BLOB_REPORTER_EVIDENCE,
          label
        )
        fs.mkdirSync(target, { recursive: true })
        for (const name of [
          'merged.json',
          'plain.json',
          'report.xml',
          'rows.json',
        ])
          fs.copyFileSync(path.join(mergedRoot, name), path.join(target, name))
        fs.copyFileSync(
          path.join(root, 'blobs/actual.json'),
          path.join(target, 'actual-blob.json')
        )
        fs.writeFileSync(
          path.join(target, 'closed-phases.json'),
          JSON.stringify({ record, merged, plain, junit }, null, 2)
        )
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  }
  console.log(
    JSON.stringify({
      profiles: 6,
      cases: 9,
      callbackRows: 30,
      recordedAndReplayErrorsRetained: true,
      noAuthoredTestsInMergeRoot: true,
      jsonAndJUnitRetained: true,
    })
  )
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
