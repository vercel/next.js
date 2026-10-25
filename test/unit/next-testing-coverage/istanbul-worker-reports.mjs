import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  existsSync,
  cpSync,
} from 'node:fs'
import { join, basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'
const [consumerArg, outputArg, profile] = process.argv.slice(2),
  consumer = resolve(consumerArg),
  output = resolve(outputArg),
  source = process.argv.includes('--source'),
  here = dirname(fileURLToPath(import.meta.url)),
  load = createRequire(join(consumer, 'package.json'))
assert(consumerArg && outputArg && profile)
if (!source)
  for (const name of ['vitest', 'vite', '@vitest/mocker'])
    assert.throws(() => load.resolve(name))
const row = JSON.parse(
  readFileSync(join(here, 'fixtures/istanbul-provider/workers-pristine.json'))
).rows.find((row) => row.name === profile)
assert(row)
const fixture = mkdtempSync(join(consumer, '.next-istanbul-workers-')),
  hash = (value) => createHash('sha256').update(value).digest('hex')
mkdirSync(output, { recursive: true })
try {
  for (const [name, file] of Object.entries(row.sourceFiles)) {
    assert.equal(hash(file.source), file.sha256)
    writeFileSync(join(fixture, name), file.source)
  }
  writeFileSync(join(fixture, 'vitest.config.mjs'), row.config)
  writeFileSync(
    join(fixture, 'next.config.mjs'),
    'export default ' + JSON.stringify({ turbopack: { root: consumer } }) + '\n'
  )
  const env = {
    ...process.env,
    NODE_ENV: 'development',
    CI: '1',
    FORCE_COLOR: '0',
    NEXT_TELEMETRY_DISABLED: '1',
    TURBO_TASKS_AVAILABLE_PARALLELISM: '4',
  }
  for (const key of [
    'NODE_OPTIONS',
    'NODE_PATH',
    'NEXT_TEST_NATIVE_DIR',
    'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
  ])
    delete env[key]
  const owner = await runOwnedNode(
    [
      source
        ? join(consumer, 'packages/next/dist/bin/next')
        : load.resolve('next/dist/bin/next'),
      'test',
      fixture,
      '--run',
      '--reporter=json',
      '--outputFile=' + join(output, 'cases.json'),
    ],
    { cwd: fixture, env, auditDir: join(output, 'owners'), timeoutMs: 120000 }
  )
  writeFileSync(
    join(output, 'owner.json'),
    JSON.stringify(owner, null, 2) + '\n'
  )
  writeFileSync(join(output, 'stdout.log'), owner.stdout)
  writeFileSync(join(output, 'stderr.log'), owner.stderr)
  assertOwnedNodeCompleted(owner, 'Actual Istanbul file workers ' + profile)
  assert.equal(owner.status, 0, owner.stderr)
  cpSync(join(fixture, 'coverage'), join(output, 'coverage'), {
    recursive: true,
  })
  for (const name of ['coverage-final.json', 'coverage-summary.json']) {
    const raw = JSON.parse(readFileSync(join(fixture, 'coverage', name))),
      actual = Object.fromEntries(
        Object.entries(raw).map(([file, data]) => [
          file === 'total' ? file : basename(file),
          { ...data, ...('path' in data ? { path: basename(data.path) } : {}) },
        ])
      )
    assert.deepEqual(actual, row.reports[name])
  }
  assert.equal(
    readFileSync(join(fixture, 'coverage/lcov.info'), 'utf8'),
    row.reports['lcov.info']
  )
  const result = JSON.parse(readFileSync(join(output, 'cases.json')))
  assert.deepEqual(
    result.testResults
      .map((file) => ({
        file: basename(file.name),
        status: file.status,
        message: file.message,
        cases: file.assertionResults.map(({ duration, ...test }) => test),
      }))
      .sort((a, b) => a.file.localeCompare(b.file)),
    row.cases
  )
  if (row.actualParallelBarrier)
    for (const name of ['a', 'b'])
      assert.equal(
        readFileSync(join(fixture, 'ready-' + name), 'utf8'),
        'entered'
      )
  for (const [name, file] of Object.entries(row.sourceFiles))
    assert.equal(hash(readFileSync(join(fixture, name))), file.sha256)
  writeFileSync(
    join(output, 'CHECKS.json'),
    JSON.stringify(
      {
        profile,
        completeCasesAndReports: true,
        actualParallelBarrier: row.actualParallelBarrier,
        defaultConfigurationReportEquality: true,
        allOwnersClosed: true,
      },
      null,
      2
    ) + '\n'
  )
} finally {
  rmSync(fixture, { recursive: true, force: true })
  writeFileSync(
    join(output, 'CLOSED.json'),
    JSON.stringify({ fixtureRetired: !existsSync(fixture) }) + '\n'
  )
}
