import assert from 'node:assert/strict'
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
import { dirname, join, resolve } from 'node:path'
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
const body = readFileSync(join(fixtures, 'format.case.mjs.txt'), 'utf8')
const profiles = {
  default: {
    format: 'undefined',
    expected: 'default',
  },
  expanded: {
    format: '{ indent: 4, escapeString: false, printBasicPrototype: true }',
    expected: 'expanded',
  },
  'compact-unsorted': {
    format: '{ min: true, indent: 0, compareKeys: null }',
    expected: 'compact-unsorted',
  },
  bounded: {
    format:
      '{ maxDepth: 1, maxWidth: 1, callToJSON: false, printFunctionName: false }',
    expected: 'bounded',
  },
  unlimited: {
    format:
      '{ maxDepth: Infinity, maxWidth: Infinity, maxOutputLength: Infinity }',
    expected: 'default',
  },
  'root-global-extends-false': {
    format: '{ indent: 4, escapeString: false, printBasicPrototype: true }',
    expected: 'expanded',
    projects: [
      {
        extends: false,
        test: {
          name: 'independent',
          include: ['format.case.mjs'],
        },
      },
    ],
  },
  'root-child-ignored': {
    format: '{ indent: 4, escapeString: false, printBasicPrototype: true }',
    expected: 'expanded',
    projects: [
      {
        extends: false,
        test: {
          name: 'independent',
          include: ['format.case.mjs'],
          snapshotFormat: {
            min: true,
            indent: 0,
          },
        },
      },
    ],
  },
  'explicit-undefined': {
    format: '{ printBasicPrototype: undefined, escapeString: undefined }',
    expected: 'explicit-undefined',
  },
  spacequotes: {
    format:
      "{ quoteKeys: false, singleQuote: true, spacingInner: ' ', spacingOuter: ' ', escapeRegex: true, printFunctionName: false, callToJSON: false }",
    expected: 'spacequotes',
  },
}
const load = createRequire(join(consumer, 'package.json'))
if (kind === 'installed')
  for (const name of ['vitest', 'vite', '@vitest/mocker'])
    assert.throws(() => load.resolve(name), { code: 'MODULE_NOT_FOUND' })
const next =
  kind === 'source'
    ? join(consumer, 'packages/next/dist/bin/next')
    : load.resolve('next/dist/bin/next')
const receipts = []
function assertSnapshotReport(report, round) {
  assert.equal(report.success, true)
  assert.equal(report.numTotalTests, 5)
  assert.equal(report.numPassedTests, 5)
  assert.equal(report.numFailedTests, 0)
  assert.equal(report.testResults.length, 1)
  assert.equal(report.testResults[0].status, 'passed')
  assert.equal(report.testResults[0].message, '')
  assert.deepEqual(
    report.testResults[0].assertionResults.map((test) => [
      test.fullName,
      test.status,
    ]),
    [
      ['tree', 'passed'],
      ['special values', 'passed'],
      ['property matcher', 'passed'],
      ['inline', 'passed'],
      ['raw file', 'passed'],
    ]
  )
  for (const test of report.testResults[0].assertionResults)
    assert.deepEqual(test.failureMessages, [])
  assert.equal(report.snapshot.total, 5)
  assert.equal(report.snapshot.added, round === 'update' ? 5 : 0)
  assert.equal(report.snapshot.matched, round === 'read' ? 5 : 0)
  assert.equal(report.snapshot.unmatched, 0)
  assert.equal(report.snapshot.unchecked, 0)
  assert.equal(report.snapshot.failure, false)
  assert.equal(report.snapshot.didUpdate, round === 'update')
}
for (const [profile, entry] of Object.entries(profiles)) {
  if (selectedProfile && profile !== selectedProfile) continue
  for (const mode of ['development', 'production']) {
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
        const report = JSON.parse(readFileSync(reportPath, 'utf8'))
        writeFileSync(
          join(dir, 'OBSERVED.json'),
          JSON.stringify(report, null, 2) + '\n'
        )
        assertSnapshotReport(report, round)
        const actual = {
          snapshot: readFileSync(
            join(fixture, '__snapshots__/format.case.mjs.snap'),
            'utf8'
          ),
          source: readFileSync(join(fixture, 'format.case.mjs'), 'utf8'),
          raw: readFileSync(join(fixture, 'raw.txt'), 'utf8'),
        }
        assert.equal(
          actual.snapshot,
          readFileSync(
            join(fixtures, 'expected', entry.expected + '.snap.txt'),
            'utf8'
          )
        )
        assert.equal(
          actual.source,
          readFileSync(
            join(fixtures, 'expected', entry.expected + '.mjs.txt'),
            'utf8'
          )
        )
        assert.equal(actual.raw, 'raw\nbytes')
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
          reportBehaviorChecked: true,
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
console.log('snapshot-format: all profiles passed ' + receipts.length + ' runs')
