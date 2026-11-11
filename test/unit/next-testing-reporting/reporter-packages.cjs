const {
  resolveFixturePath,
  fixtureFiles,
} = require('../../lib/next-testing-fixtures.cjs')
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
const typed = path.join(__dirname, 'fixtures/reporter-packages')
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))
const digest = (file) =>
  createHash('sha256').update(fs.readFileSync(file)).digest('hex')

async function run(root, mode, specifier) {
  return runReporterCommand({
    root,
    mode,
    args: [
      '--merge-reports=./blobs',
      '--reporter=' + specifier,
      '--reporter=json',
      '--outputFile=merged.json',
    ],
    timeoutMessage: 'Package reporter merge did not close',
    cleanupMessage: 'Package reporter cleanup did not close',
  })
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
      fs.copyFileSync(resolveFixturePath(blob), blobPath)
      function copySources(directory, target) {
        fs.mkdirSync(target, { recursive: true })
        for (const file of fixtureFiles(directory)) {
          const from = path.join(directory, file)
          const to = path.join(target, file.replace(/\.txt$/, ''))
          fs.mkdirSync(path.dirname(to), { recursive: true })
          fs.copyFileSync(resolveFixturePath(from), to)
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
      retainReporterEvidence(root, result, evidence, name)
      assert.equal(result.code, 1, result.stdout + result.stderr)
      const rows = read(path.join(root, 'rows.json'))
      assert.deepEqual(
        rows,
        read(resolveFixturePath(path.join(typed, mode + '.rows.json')))
      )
      const imported = read(path.join(root, 'merged.json'))
      const expected = read(
        resolveFixturePath(path.join(typed, mode + '.report.json'))
      )
      assertForeignReport(imported, expected, read(blobPath))
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
