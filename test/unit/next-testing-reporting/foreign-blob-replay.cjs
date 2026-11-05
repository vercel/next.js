const { resolveFixturePath } = require('../../lib/next-testing-fixtures.cjs')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  runReporterCommand,
  assertForeignReport,
  retainReporterEvidence,
} = require('./reporter-command.cjs')
const { createHash } = require('node:crypto')
const repo = path.resolve(__dirname, '../../..')
const source = path.join(__dirname, 'fixtures/case-result-foreign')
const native = path.join(__dirname, 'fixtures/vitest-5.0.4')
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))
const digest = (file) =>
  createHash('sha256').update(fs.readFileSync(file)).digest('hex')

async function run(root) {
  return runReporterCommand({
    root,
    args: [
      '--merge-reports=./blobs',
      '--reporter=./reporter.mjs',
      '--reporter=json',
      '--outputFile=merged.json',
    ],
    timeoutMessage: 'Foreign reporter merge did not close',
    cleanupMessage: 'Foreign reporter cleanup did not close',
  })
}

async function main() {
  const names = [
    'original-public-merge',
    'nested-pass-fail-retry',
    'runtime-skip-retry-repeat',
    'collection-error',
    'unhandled-error',
    'development',
    'production',
    'development-cohort',
  ]
  let callbacks = 0,
    fullRows = 0
  for (const name of names) {
    const root = fs.mkdtempSync(path.join(repo, '.next-test-foreign-replay-'))
    try {
      fs.mkdirSync(path.join(root, 'blobs'))
      const ownBlob = path.join(source, name + '.blob')
      const blob = fs.existsSync(resolveFixturePath(ownBlob))
        ? ownBlob
        : path.join(native, name + '.blob')
      const blobPath = path.join(root, 'blobs/actual.blob')
      fs.copyFileSync(resolveFixturePath(blob), blobPath)
      fs.copyFileSync(
        resolveFixturePath(path.join(source, 'reporter.mjs.txt')),
        path.join(root, 'reporter.mjs')
      )
      fs.writeFileSync(
        path.join(root, 'package.json'),
        '{"private":true,"type":"module"}\n'
      )
      fs.writeFileSync(
        path.join(root, 'next.config.mjs'),
        'export default {}\n'
      )
      const before = {
        blob: digest(blobPath),
        reporter: digest(path.join(root, 'reporter.mjs')),
      }
      const result = await run(root)
      const evidence = process.env.NEXT_TESTING_FOREIGN_REPORTER_EVIDENCE
      retainReporterEvidence(root, result, evidence, name)
      assert.equal(result.code, 1, result.stdout + result.stderr)
      const rows = read(path.join(root, 'rows.json'))
      assert.deepEqual(
        rows,
        read(resolveFixturePath(path.join(source, name + '.rows.json')))
      )
      const imported = read(path.join(root, 'merged.json'))
      const expected = read(
        resolveFixturePath(path.join(source, name + '.report.json'))
      )
      assertForeignReport(imported, expected, read(blobPath))
      assert.equal(digest(blobPath), before.blob)
      assert.equal(digest(path.join(root, 'reporter.mjs')), before.reporter)
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
      corpora: names.length,
      callbacks,
      fullRows,
      noAuthoredTests: true,
      completeForeignReports: names.length,
      originalAndReplayErrors: true,
    })
  )
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
