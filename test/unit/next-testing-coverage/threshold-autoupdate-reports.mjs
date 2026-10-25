import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'

const [consumerArg, destinationArg, mode = 'development'] =
  process.argv.slice(2)
assert(consumerArg && destinationArg)
assert(['development', 'production'].includes(mode))
const consumer = resolve(consumerArg),
  destination = resolve(destinationArg),
  here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(join(consumer, 'package.json'))
if (!process.argv.includes('--source'))
  for (const name of ['vitest', 'vite'])
    assert.throws(() => require.resolve(name))
const pristine = JSON.parse(
  readFileSync(join(here, 'fixtures/threshold-autoupdate/pristine.json'))
)
assert(mode === pristine.mode || pristine.productionRows)
const selectedProfile = process.argv
  .find((argument) => argument.startsWith('--profile='))
  ?.slice('--profile='.length)
const rows = (
  process.argv.includes('--concurrent')
    ? pristine.currentEditRows
    : (mode === 'production'
        ? pristine.productionRows.filter((row) => !row.profile.noConfig)
        : [...pristine.rows, ...pristine.sharedCliRows]
      ).filter(
        (row) =>
          !process.argv.includes('--writer') || row.name !== 'missing-config'
      )
).filter((row) => selectedProfile === undefined || row.name === selectedProfile)
const records = [],
  hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
const portable = (data) =>
  data &&
  Object.fromEntries(
    Object.entries(data).map(([file, row]) => [
      file === 'total' ? file : basename(file),
      { ...row, ...('path' in row ? { path: basename(file) } : {}) },
    ])
  )
const caseKeys = [
  'ancestorTitles',
  'fullName',
  'status',
  'title',
  'failureMessages',
  'meta',
  'tags',
  'benchmarks',
]
const cases = (report) =>
  report.testResults
    .map((file) => ({
      file: basename(file.name),
      cases: file.assertionResults.map((test) =>
        Object.fromEntries(
          caseKeys.filter((key) => key in test).map((key) => [key, test[key]])
        )
      ),
    }))
    .sort((a, b) => a.file.localeCompare(b.file))
const failureMessages = (rows) =>
  rows.map((file) => ({
    ...file,
    cases: file.cases.map((test) => ({
      ...test,
      failureMessages: test.failureMessages.map(
        (message) => message.split('\n')[0]
      ),
    })),
  }))
const coverageText = (stdout) => {
  const lines = stdout.split('\n'),
    start = lines.findIndex(
      (line) => line.startsWith('---') && line.includes('|')
    )
  return start < 0
    ? null
    : lines
        .slice(start)
        .filter(
          (line) =>
            !line.startsWith('Updating thresholds to configuration file.')
        )
        .join('\n')
        .trim()
}
mkdirSync(destination, { recursive: true })
for (const row of rows) {
  const output = join(destination, row.name),
    fixture = mkdtempSync(join(consumer, '.next-threshold-autoupdate-'))
  mkdirSync(output)
  try {
    const sources = process.argv.includes('--concurrent')
      ? pristine.editSourceFiles
      : pristine.sourceFiles
    for (const [name, file] of Object.entries(sources)) {
      assert.equal(hash(file.source), file.sha256)
      writeFileSync(join(fixture, name), file.source)
    }
    writeFileSync(
      join(fixture, 'next.config.mjs'),
      'export default ' +
        JSON.stringify({ turbopack: { root: consumer } }) +
        '\n'
    )
    const configuration = join(fixture, 'vitest.config.mjs')
    if (row.before !== null) writeFileSync(configuration, row.before)
    const env = {
      ...process.env,
      NODE_ENV: mode,
      CI: '1',
      FORCE_COLOR: '0',
      NEXT_TELEMETRY_DISABLED: '1',
      TURBO_TASKS_AVAILABLE_PARALLELISM: '4',
      COVERAGE_TEST_EDIT_KIND: row.profile.edit ?? '',
    }
    for (const name of [
      'NODE_OPTIONS',
      'NODE_PATH',
      'NEXT_TEST_NATIVE_DIR',
      'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
    ])
      delete env[name]
    const owner = await runOwnedNode(
      [
        require.resolve('next/dist/bin/next'),
        'test',
        fixture,
        '--run',
        '--reporter=json',
        '--outputFile=' + join(output, 'cases.json'),
        ...(row.profile.flags ?? []).map((flag) =>
          flag.startsWith('--') ? flag : '--filter=' + flag
        ),
      ],
      { cwd: fixture, env, auditDir: join(output, 'owners'), timeoutMs: 120000 }
    )
    writeFileSync(
      join(output, 'owner.json'),
      JSON.stringify(owner, null, 2) + '\n'
    )
    writeFileSync(join(output, 'stdout.log'), owner.stdout)
    writeFileSync(join(output, 'stderr.log'), owner.stderr)
    const after = existsSync(configuration)
      ? readFileSync(configuration, 'utf8')
      : null
    writeFileSync(
      join(output, 'after.mjs'),
      after ?? '// absent configuration\n'
    )
    const reports = join(fixture, 'coverage'),
      coverage = existsSync(join(reports, 'coverage-final.json'))
        ? portable(
            JSON.parse(readFileSync(join(reports, 'coverage-final.json')))
          )
        : null
    writeFileSync(
      join(output, 'actual-coverage.json'),
      JSON.stringify(coverage, null, 2) + '\n'
    )
    assertOwnedNodeCompleted(owner, 'Actual threshold autoUpdate ' + row.name)
    assert.equal(owner.status, row.exitCode, owner.stdout + owner.stderr)
    assert.equal(after, row.after)
    const report = JSON.parse(readFileSync(join(output, 'cases.json'))),
      actualCases = cases(report),
      expectedCases = [...row.cases].sort((a, b) =>
        a.file.localeCompare(b.file)
      )
    const started = report.next.events.filter(
      (event) => event.type === 'file-start'
    )
    assert(started.length > 0)
    assert(started.every((event) => event.entry.profile.mode === mode))
    const failingBody = actualCases.some((file) =>
      file.cases.some((test) => test.status === 'failed')
    )
    if (failingBody) {
      // Runner implementation frames differ; preserve the full raw errors and
      // compare the actual assertion message, authored source frame and rows.
      assert.deepEqual(
        failureMessages(actualCases),
        failureMessages(expectedCases)
      )
      for (const file of actualCases)
        for (const test of file.cases)
          if (test.status === 'failed')
            assert(
              test.failureMessages.every((message) =>
                message.includes(file.file + ':2:')
              )
            )
    } else assert.deepEqual(actualCases, expectedCases)
    for (const key of [
      'success',
      'numTotalTests',
      'numPassedTests',
      'numFailedTests',
      'numPendingTests',
    ])
      assert.equal(report[key], row.reportSummary[key])
    assert.deepEqual(coverage, row.coverage)
    if (row.summary !== null)
      assert.deepEqual(
        portable(
          JSON.parse(readFileSync(join(reports, 'coverage-summary.json')))
        ),
        row.summary
      )
    if (row.lcov !== null)
      assert.equal(readFileSync(join(reports, 'lcov.info'), 'utf8'), row.lcov)
    assert.equal(coverageText(owner.stdout), row.coverageText)
    const expectedError = row.diagnostics.match(/Error: ([^\n]+)/)?.[1]
    if (expectedError)
      assert(owner.stderr.includes(expectedError), owner.stderr)
    const updated = owner.stdout.includes(
      'Updating thresholds to configuration file.'
    )
    assert.equal(updated, row.updateLog.length > 0)
    const record = {
      name: row.name,
      mode,
      exitCode: owner.status,
      configBytesEqual: true,
      completeReportsEqual: true,
      completeCaseRowsEqual: !failingBody,
      assertionMessageAndSourceFrameEqual: failingBody ? true : undefined,
      failingBodyRunnerFramesCompared: failingBody ? false : undefined,
    }
    records.push(record)
    writeFileSync(
      join(output, 'CHECKS.json'),
      JSON.stringify(record, null, 2) + '\n'
    )
    console.log(JSON.stringify(record))
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
}
writeFileSync(
  join(destination, 'RESULTS.json'),
  JSON.stringify(
    {
      status: 'passed',
      mode,
      profiles: records.length,
      records,
      ...(process.argv.includes('--writer')
        ? { unqualifiedPrerequisites: [pristine.originalNonSharedCliBoundary] }
        : {}),
    },
    null,
    2
  ) + '\n'
)
