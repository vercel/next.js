import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  existsSync,
  rmSync,
} from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'
const [consumerArg, outputArg] = process.argv.slice(2)
assert(consumerArg && outputArg)
const mode =
  process.argv
    .find((argument) => argument.startsWith('--mode='))
    ?.slice('--mode='.length) ?? 'development'
assert(['development', 'production'].includes(mode))
const consumer = resolve(consumerArg),
  output = resolve(outputArg),
  here = dirname(fileURLToPath(import.meta.url)),
  require = createRequire(join(consumer, 'package.json'))
if (!process.argv.includes('--source'))
  for (const name of ['vitest', 'vite'])
    assert.throws(() => require.resolve(name))
const pristine = JSON.parse(
    readFileSync(join(here, 'fixtures/threshold-formatter/pristine.json'))
  ),
  hash = (value) => createHash('sha256').update(value).digest('hex'),
  results = []
const selectedProfiles = process.argv
  .find((argument) => argument.startsWith('--profiles='))
  ?.slice('--profiles='.length)
  .split(',')
const portable = (data) =>
  data &&
  Object.fromEntries(
    Object.entries(data).map(([file, row]) => [
      file === 'total' ? file : basename(file),
      { ...row, ...('path' in row ? { path: basename(file) } : {}) },
    ])
  )
const keys = [
  'ancestorTitles',
  'fullName',
  'status',
  'title',
  'failureMessages',
  'meta',
  'tags',
  'benchmarks',
]
const cases = (result) =>
  result.testResults
    .map((file) => ({
      file: basename(file.name),
      cases: file.assertionResults.map((test) =>
        Object.fromEntries(
          keys.filter((key) => key in test).map((key) => [key, test[key]])
        )
      ),
    }))
    .sort((a, b) => a.file.localeCompare(b.file))
mkdirSync(output, { recursive: true })
for (const row of (mode === 'production'
  ? pristine.productionRows
  : pristine.rows
).filter((row) => !selectedProfiles || selectedProfiles.includes(row.name))) {
  const destination = join(output, row.name),
    fixture = mkdtempSync(join(consumer, '.next-threshold-formatter-'))
  mkdirSync(destination)
  try {
    for (const [name, source] of Object.entries(pristine.sourceFiles)) {
      assert.equal(hash(source.source), source.sha256)
      writeFileSync(join(fixture, name), source.source)
    }
    writeFileSync(
      join(fixture, 'next.config.mjs'),
      'export default ' +
        JSON.stringify({ turbopack: { root: consumer } }) +
        '\n'
    )
    const trace = join(destination, 'lifecycle.jsonl'),
      configFile = join(fixture, 'vitest.config.mjs'),
      before = row.before.replaceAll('<TRACE_DIR>', output)
    writeFileSync(configFile, before)
    // These are the exact setup callbacks authored by the pristine measurement.
    writeFileSync(
      join(fixture, 'setup.mjs'),
      `import { appendFileSync } from 'node:fs'\nconst emit = value => appendFileSync(${JSON.stringify(trace)}, JSON.stringify(value)+'\\n')\nexport default function setup() { emit({kind:'setup'}); return () => { emit({kind:'teardown'}); ${row.profile.teardownThrows ? "throw new Error('actual formatter setup teardown failure')" : ''} } }\n`
    )
    const env = {
      ...process.env,
      NODE_ENV: mode,
      NEXT_TELEMETRY_DISABLED: '1',
      CI: '1',
      FORCE_COLOR: '0',
      TURBO_TASKS_AVAILABLE_PARALLELISM: '4',
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
        '--outputFile=' + join(destination, 'cases.json'),
        ...(row.profile.flags ?? []),
      ],
      {
        cwd: fixture,
        env,
        auditDir: join(destination, 'owners'),
        timeoutMs: 120000,
      }
    )
    writeFileSync(
      join(destination, 'owner.json'),
      JSON.stringify(owner, null, 2) + '\n'
    )
    writeFileSync(join(destination, 'stdout.log'), owner.stdout)
    writeFileSync(join(destination, 'stderr.log'), owner.stderr)
    assertOwnedNodeCompleted(owner, 'actual threshold formatter ' + row.name)
    assert.equal(owner.status, row.exitCode, owner.stdout + owner.stderr)
    const report = JSON.parse(readFileSync(join(destination, 'cases.json')))
    const started = report.next.events.filter(
      (event) => event.type === 'file-start'
    )
    assert(started.length > 0)
    assert(started.every((event) => event.entry.profile.mode === mode))
    assert.deepEqual(
      cases(report),
      [...row.cases].sort((a, b) => a.file.localeCompare(b.file))
    )
    for (const key of [
      'success',
      'numTotalTests',
      'numPassedTests',
      'numFailedTests',
      'numPendingTests',
    ])
      assert.equal(report[key], row.reportSummary[key])
    const after = readFileSync(configFile, 'utf8')
    writeFileSync(join(destination, 'after.mjs'), after)
    assert.equal(after, row.after.replaceAll('<TRACE_DIR>', output))
    const actualTrace = existsSync(trace)
      ? readFileSync(trace, 'utf8')
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line))
      : []
    assert.deepEqual(actualTrace, row.trace)
    const directory = join(fixture, 'coverage')
    for (const [name, expected] of [
      ['coverage-final.json', row.coverage],
      ['coverage-summary.json', row.summary],
    ]) {
      const actual = existsSync(join(directory, name))
        ? portable(JSON.parse(readFileSync(join(directory, name))))
        : null
      writeFileSync(
        join(destination, name),
        JSON.stringify(actual, null, 2) + '\n'
      )
      assert.deepEqual(actual, expected)
    }
    assert.equal(readFileSync(join(directory, 'lcov.info'), 'utf8'), row.lcov)
    const lines = owner.stdout.split('\n'),
      start = lines.findIndex(
        (line) => line.startsWith('---') && line.includes('|')
      ),
      text = start < 0 ? null : lines.slice(start).join('\n').trim()
    assert.equal(text, row.coverageText)
    if (row.profile.formatterThrows)
      assert(owner.stderr.includes('actual threshold formatter failure'))
    if (row.profile.teardownThrows)
      assert(owner.stderr.includes('actual formatter setup teardown failure'))
    const result = {
      name: row.name,
      status: 'passed',
      completeCaseRowsEqual: true,
      completeReportsEqual: true,
      currentConfigBytesEqual: true,
      actualFormatterSetupTeardownTraceEqual: true,
      exitCode: owner.status,
    }
    results.push(result)
    writeFileSync(
      join(destination, 'CHECKS.json'),
      JSON.stringify(result, null, 2) + '\n'
    )
    console.log(JSON.stringify(result))
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
}
writeFileSync(
  join(output, 'RESULTS.json'),
  JSON.stringify(
    { status: 'passed', mode, profiles: results.length, results },
    null,
    2
  ) + '\n'
)
