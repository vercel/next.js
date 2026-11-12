import assert from 'node:assert/strict'
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
  readFileSync(join(here, 'fixtures/threshold-autoupdate/expectations.json'))
)
const selectedProfile = process.argv
  .find((argument) => argument.startsWith('--profile='))
  ?.slice('--profile='.length)
const rows = (
  process.argv.includes('--concurrent')
    ? pristine.currentEditRows
    : [...pristine.rows, ...pristine.sharedCliRows]
        .filter((row) => mode !== 'production' || !row.profile.noConfig)
        .filter(
          (row) =>
            !process.argv.includes('--writer') || row.name !== 'missing-config'
        )
).filter((row) => selectedProfile === undefined || row.name === selectedProfile)
const records = []
const configureMode = (source) => {
  if (
    source === null ||
    mode !== 'production' ||
    process.argv.includes('--concurrent')
  )
    return source
  return source.includes('"test": {')
    ? source.replace('"test": {', '"test": {\n    "mode": "production",')
    : source.replace('"test":{', '"test":{"mode":"production",')
}
const expectedCounters = (row) => {
  const counters = structuredClone(pristine.counters)
  if (!row.fullTestRan)
    counters['fully.mjs'] = { s: { 0: 0 }, f: { 0: 0 }, b: {} }
  return counters
}
mkdirSync(destination, { recursive: true })
for (const row of rows) {
  const output = join(destination, row.name),
    fixture = mkdtempSync(join(consumer, '.next-threshold-autoupdate-'))
  mkdirSync(output)
  try {
    const sourceNames = [
      'contract.test.mjs',
      'subject.mjs',
      'unimported.mjs',
      'fully.mjs',
      'full.test.mjs',
      'failed.case.mjs',
      'package.json',
      ...(process.argv.includes('--concurrent')
        ? ['edit-config.case.mjs']
        : []),
    ]
    for (const name of sourceNames)
      writeFileSync(
        join(fixture, name),
        readFileSync(
          join(here, 'fixtures/threshold-autoupdate/sources', name + '.txt')
        )
      )
    writeFileSync(
      join(fixture, 'next.config.mjs'),
      'export default ' +
        JSON.stringify({ turbopack: { root: consumer } }) +
        '\n'
    )
    const configuration = join(fixture, 'vitest.config.mjs')
    if (row.before !== null)
      writeFileSync(configuration, configureMode(row.before))
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
    assertOwnedNodeCompleted(owner, 'Threshold autoUpdate ' + row.name)
    assert.equal(owner.status, row.exitCode, owner.stdout + owner.stderr)
    assert.equal(after, configureMode(row.after))
    const report = JSON.parse(readFileSync(join(output, 'cases.json')))
    const started = report.next.events.filter(
      (event) => event.type === 'file-start'
    )
    assert(started.length > 0)
    assert(started.every((event) => event.entry.profile.mode === mode))
    for (const [key, expected] of Object.entries(row.reportSummary))
      assert.equal(report[key], expected)
    for (const file of report.testResults)
      for (const test of file.assertionResults)
        if (test.status === 'failed') {
          assert.equal(basename(file.name), 'failed.case.mjs')
          assert(
            test.failureMessages.every((message) =>
              message.includes('expected 1 to be 2')
            )
          )
          assert(
            test.failureMessages.every((message) =>
              message.includes('failed.case.mjs:2:')
            )
          )
        }
    const reports = join(fixture, 'coverage')
    for (const name of [
      'coverage-final.json',
      'coverage-summary.json',
      'lcov.info',
    ])
      assert.equal(
        existsSync(join(reports, name)),
        row.reports.includes(name),
        name
      )
    if (row.reports.includes('coverage-final.json')) {
      const coverage = JSON.parse(
        readFileSync(join(reports, 'coverage-final.json'))
      )
      const counters = Object.fromEntries(
        Object.entries(coverage).map(([file, data]) => [
          basename(file),
          { s: data.s, f: data.f, b: data.b },
        ])
      )
      assert.deepEqual(counters, expectedCounters(row))
    }
    if (row.error) assert(owner.stderr.includes(row.error), owner.stderr)
    for (const error of row.thresholdErrors)
      assert(
        (owner.stdout + owner.stderr).includes(error.replace(/^ERROR: /, '')),
        owner.stdout + owner.stderr
      )
    const updated = owner.stdout.includes(
      'Updating thresholds to configuration file.'
    )
    assert.equal(updated, row.updated)
    const record = {
      name: row.name,
      mode,
      exitCode: owner.status,
      configBytesEqual: true,
      caseCountsEqual: true,
      coverageCountersEqual: true,
      reportFilesEqual: true,
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
    },
    null,
    2
  ) + '\n'
)
