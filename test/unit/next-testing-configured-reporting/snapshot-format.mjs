import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'

const [kind, consumerArg, outputArg, selectedProfile, selectedMode] =
  process.argv.slice(2)
assert(['source', 'installed'].includes(kind))
const consumer = resolve(consumerArg),
  output = resolve(outputArg)
mkdirSync(output)
const fixtures = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures/snapshot-format'
)
const expected = JSON.parse(
  readFileSync(join(fixtures, 'reference.json'), 'utf8')
)
const body = readFileSync(join(fixtures, 'format.case.mjs.txt'), 'utf8')
assert.equal(
  createHash('sha256').update(body).digest('hex'),
  expected.bodySHA256
)
const load = createRequire(join(consumer, 'package.json'))
if (kind === 'installed')
  for (const name of ['vitest', 'vite', '@vitest/mocker'])
    assert.throws(() => load.resolve(name), { code: 'MODULE_NOT_FOUND' })
const next =
  kind === 'source'
    ? join(consumer, 'packages/next/dist/bin/next')
    : load.resolve('next/dist/bin/next')
const receipts = []
function stableReport(report) {
  const { startTime, next: _nextMetadata, ...stable } = report
  return {
    ...stable,
    testResults: stable.testResults.map(
      ({ startTime, endTime, name, assertionResults, ...file }) => ({
        ...file,
        name: basename(name),
        assertionResults: assertionResults.map(({ duration, ...test }) => test),
      })
    ),
  }
}
for (const [profile, entry] of Object.entries(expected.profiles)) {
  if (selectedProfile && profile !== selectedProfile) continue
  for (const [mode, reference] of Object.entries(entry.modes)) {
    if (selectedMode && mode !== selectedMode) continue
    const fixture = mkdtempSync(join(consumer, '.next-test-snapshot-format-'))
    const sink = join(output, mode + '-' + profile)
    mkdirSync(sink)
    writeFileSync(
      join(fixture, 'package.json'),
      '{"type":"module","private":true}\n'
    )
    writeFileSync(join(fixture, 'format.case.mjs'), body)
    symlinkSync(
      join(consumer, 'node_modules'),
      join(fixture, 'node_modules'),
      'dir'
    )
    writeFileSync(
      join(fixture, 'next.config.mjs'),
      'export default ' +
        JSON.stringify({ turbopack: { root: consumer } }) +
        '\n'
    )
    const projects =
      entry.projects === undefined
        ? ''
        : ', projects: ' +
          JSON.stringify(
            entry.projects.map((project) => ({
              ...project,
              test: { ...project.test, mode },
            }))
          )
    writeFileSync(
      join(fixture, 'next.test.config.mjs'),
      `export default { test: { environment: 'node', mode: ${JSON.stringify(mode)}, include: ['format.case.mjs'], maxWorkers: 1, snapshotFormat: (${entry.format})${projects} } }\n`
    )
    let completed = false
    try {
      for (const round of ['update', 'read']) {
        const dir = join(sink, round)
        mkdirSync(dir)
        const env = {
          ...process.env,
          NODE_ENV: mode,
          CI: '1',
          FORCE_COLOR: '0',
          NEXT_TELEMETRY_DISABLED: '1',
        }
        for (const key of [
          'NODE_OPTIONS',
          'NODE_PATH',
          'NEXT_TEST_NATIVE_DIR',
          'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
        ])
          delete env[key]
        const reportPath = join(dir, 'report.json')
        const result = await runOwnedNode(
          [
            next,
            'test',
            fixture,
            '--run',
            '--reporter=json',
            '--outputFile=' + reportPath,
            ...(round === 'update' ? ['--update'] : []),
          ],
          {
            cwd: fixture,
            env,
            auditDir: join(dir, 'owners'),
            timeoutMs: 120000,
          }
        )
        writeFileSync(
          join(dir, 'RESULT.json'),
          JSON.stringify(result, null, 2) + '\n'
        )
        writeFileSync(join(dir, 'stdout.log'), result.stdout)
        writeFileSync(join(dir, 'stderr.log'), result.stderr)
        assertOwnedNodeCompleted(result, `${kind} ${mode} ${profile} ${round}`)
        assert.equal(result.status, 0, result.stderr)
        const report = stableReport(
          JSON.parse(readFileSync(reportPath, 'utf8'))
        )
        writeFileSync(
          join(dir, 'OBSERVED.json'),
          JSON.stringify(report, null, 2) + '\n'
        )
        assert.deepEqual(report, reference.reports[round])
        const actual = {
          snapshot: readFileSync(
            join(fixture, '__snapshots__/format.case.mjs.snap'),
            'utf8'
          ),
          source: readFileSync(join(fixture, 'format.case.mjs'), 'utf8'),
          raw: readFileSync(join(fixture, 'raw.txt'), 'utf8'),
        }
        assert.deepEqual(actual, reference.files)
        for (const name of [
          '.next-test.lock',
          '.next-test-snapshot-journal.json',
        ])
          assert.equal(existsSync(join(fixture, name)), false)
        receipts.push({
          kind,
          mode,
          profile,
          round,
          cases: report.numPassedTests,
          status: result.status,
          filesMatched: true,
          reportMatched: true,
        })
      }
      completed = true
    } finally {
      if (completed) rmSync(fixture, { recursive: true, force: true })
    }
  }
}
assert(receipts.length > 0)
writeFileSync(
  join(output, 'MATRIX.json'),
  JSON.stringify(receipts, null, 2) + '\n'
)
console.log(
  'snapshot-format: all profiles matched ' + receipts.length + ' runs'
)
