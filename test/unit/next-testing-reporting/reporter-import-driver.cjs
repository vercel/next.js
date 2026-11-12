const {
  resolveFixturePath,
  fixtureFiles,
} = require('../../lib/next-testing-fixtures.cjs')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')
const {
  runReporterCommand,
  assertForeignReport,
  retainReporterEvidence,
} = require('./reporter-command.cjs')

const repo = path.resolve(__dirname, '../../..')
const read = (file) =>
  JSON.parse(fs.readFileSync(resolveFixturePath(file), 'utf8'))
const digest = (file) =>
  createHash('sha256').update(fs.readFileSync(file)).digest('hex')

module.exports = function runReporterImports(options) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })

  async function main() {
    const typed = path.join(__dirname, 'fixtures', options.fixture)
    const profiles = ['development', 'production'].flatMap((mode) =>
      options.kinds.map((kind) => ({
        mode,
        kind,
        extension: options.extension?.(kind) ?? kind,
        name: mode + '-' + kind,
      }))
    )
    let callbacks = 0,
      fullRows = 0
    for (const { mode, kind, extension, name } of profiles) {
      const root = fs.mkdtempSync(
        path.join(repo, '.next-test-' + options.prefix + '-reporter-')
      )
      try {
        fs.mkdirSync(path.join(root, 'blobs'))
        const blobPath = path.join(root, 'blobs/actual.blob')
        fs.copyFileSync(
          resolveFixturePath(
            path.join(
              __dirname,
              'fixtures/case-result-foreign/development.blob'
            )
          ),
          blobPath
        )
        const before = new Map([[blobPath, digest(blobPath)]])
        const sources = options.sourceFiles
          ? options.sourceFiles(extension)
          : fixtureFiles(path.join(typed, kind)).map((file) => [
              path.join(kind, file),
              file.replace(/\.txt$/, ''),
            ])
        for (const [source, target] of sources) {
          const file = path.join(root, target)
          fs.mkdirSync(path.dirname(file), { recursive: true })
          fs.copyFileSync(resolveFixturePath(path.join(typed, source)), file)
          before.set(file, digest(file))
        }
        fs.writeFileSync(
          path.join(root, 'package.json'),
          '{"private":true,"type":"module"}\n'
        )
        fs.writeFileSync(
          path.join(root, 'next.config.mjs'),
          'export default {}\n'
        )
        if (options.hashAllInputs)
          for (const file of fixtureFiles(root)) {
            const absolute = path.join(root, file)
            before.set(absolute, digest(absolute))
          }
        const result = await runReporterCommand({
          root,
          mode,
          args: [
            '--merge-reports=./blobs',
            '--reporter=./reporter.' + extension,
            '--reporter=json',
            '--outputFile=merged.json',
          ],
          timeoutMessage: options.label + ' merge did not close',
          cleanupMessage: options.label + ' cleanup did not close',
        })
        retainReporterEvidence(
          root,
          result,
          process.env[options.evidence],
          name
        )
        assert.equal(result.code, 1, result.stdout + result.stderr)
        const rows = read(path.join(root, 'rows.json'))
        assert.deepEqual(rows, read(path.join(typed, name + '.rows.json')))
        assertForeignReport(
          read(path.join(root, 'merged.json')),
          read(path.join(typed, name + '.report.json')),
          read(blobPath)
        )
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
        [options.fact]: true,
      })
    )
  }
}
