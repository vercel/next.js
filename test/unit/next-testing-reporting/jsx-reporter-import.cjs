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
const typed = path.join(__dirname, 'fixtures/reporter-jsx')
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))
const digest = (file) =>
  createHash('sha256').update(fs.readFileSync(file)).digest('hex')

async function run(root, mode, extension) {
  return runReporterCommand({
    root,
    mode,
    args: [
      '--merge-reports=./blobs',
      '--reporter=./reporter.' + extension,
      '--reporter=json',
      '--outputFile=merged.json',
    ],
    timeoutMessage: 'JSX reporter merge did not close',
    cleanupMessage: 'JSX reporter cleanup did not close',
  })
}

async function main() {
  const profiles = ['development', 'production'].flatMap((mode) =>
    ['jsx', 'tsx'].map((extension) => ({
      mode,
      extension,
      name: mode + '-' + extension,
    }))
  )
  let callbacks = 0,
    fullRows = 0
  for (const { mode, extension, name } of profiles) {
    const root = fs.mkdtempSync(path.join(repo, '.next-test-jsx-reporter-'))
    try {
      fs.mkdirSync(path.join(root, 'blobs'))
      const blob = path.join(source, 'development.blob')
      const blobPath = path.join(root, 'blobs/actual.blob')
      fs.copyFileSync(resolveFixturePath(blob), blobPath)
      fs.copyFileSync(
        resolveFixturePath(path.join(typed, 'reporter.' + extension + '.txt')),
        path.join(root, 'reporter.' + extension)
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
        reporter: digest(path.join(root, 'reporter.' + extension)),
      }
      const result = await run(root, mode, extension)
      const evidence = process.env.NEXT_TESTING_JSX_REPORTER_EVIDENCE
      retainReporterEvidence(root, result, evidence, name)
      assert.equal(result.code, 1, result.stdout + result.stderr)
      const rows = read(path.join(root, 'rows.json'))
      assert.deepEqual(
        rows,
        read(resolveFixturePath(path.join(typed, name + '.rows.json')))
      )
      const imported = read(path.join(root, 'merged.json'))
      const expected = read(
        resolveFixturePath(path.join(typed, name + '.report.json'))
      )
      assertForeignReport(imported, expected, read(blobPath))
      assert.equal(digest(blobPath), before.blob)
      assert.equal(
        digest(path.join(root, 'reporter.' + extension)),
        before.reporter
      )
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
      jsxEvaluationAndOriginalErrors: true,
    })
  )
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
