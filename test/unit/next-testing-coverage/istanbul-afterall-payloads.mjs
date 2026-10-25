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
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'
const [phase, consumerArg, outputArg, kind] = process.argv.slice(2)
assert(['reference', 'source', 'installed'].includes(phase))
assert(['object', 'fulfilled'].includes(kind))
const consumer = resolve(consumerArg),
  output = resolve(outputArg),
  here = dirname(fileURLToPath(import.meta.url)),
  load = createRequire(join(consumer, 'package.json'))
const pristine = JSON.parse(
  readFileSync(join(here, 'fixtures/istanbul-provider/pristine.json'))
)
const fixture = mkdtempSync(join(consumer, '.next-istanbul-afterall-payload-'))
mkdirSync(output, { recursive: true })
try {
  for (const [name, file] of Object.entries(pristine.sourceFiles))
    writeFileSync(join(fixture, name), file.source)
  const body = readFileSync(
    join(
      here,
      'fixtures/istanbul-provider/shared-afterall-payload.case.mjs.txt'
    ),
    'utf8'
  ).replace(
    '__PAYLOAD__',
    kind === 'object'
      ? '{ value: 1 }'
      : "Promise.resolve('fulfilled caller payload')"
  )
  writeFileSync(join(fixture, 'payload.test.mjs'), body)
  writeFileSync(
    join(output, 'AUTHORED.json'),
    JSON.stringify(
      { kind, body, sha256: createHash('sha256').update(body).digest('hex') },
      null,
      2
    ) + '\n'
  )
  writeFileSync(
    join(fixture, 'vitest.config.mjs'),
    'export default ' +
      JSON.stringify(
        {
          test: {
            include: ['contract.test.mjs', 'full.test.mjs', 'payload.test.mjs'],
            maxWorkers: 1,
            testTimeout: 10000,
            hookTimeout: 1000,
            coverage: {
              enabled: true,
              provider: 'istanbul',
              include: ['subject.mjs', 'fully.mjs', 'unimported.mjs'],
              exclude: [],
              reporter: ['json', 'json-summary', 'lcovonly'],
              reportsDirectory: 'coverage',
              reportOnFailure: true,
            },
          },
        },
        null,
        2
      ) +
      '\n'
  )
  writeFileSync(
    join(fixture, 'next.config.mjs'),
    'export default ' + JSON.stringify({ turbopack: { root: consumer } }) + '\n'
  )
  const env = {
    ...process.env,
    CI: '1',
    NODE_ENV: 'development',
    NEXT_TELEMETRY_DISABLED: '1',
    TURBO_TASKS_AVAILABLE_PARALLELISM: '4',
  }
  delete env.NODE_OPTIONS
  delete env.NODE_PATH
  const executable =
    phase === 'reference'
      ? join(consumer, 'node_modules/vitest/vitest.mjs')
      : phase === 'source'
        ? join(consumer, 'packages/next/dist/bin/next')
        : load.resolve('next/dist/bin/next')
  const args =
    phase === 'reference'
      ? [
          executable,
          'run',
          '--root',
          fixture,
          '--config',
          join(fixture, 'vitest.config.mjs'),
          '--reporter=json',
          '--outputFile=' + join(output, 'cases.json'),
        ]
      : [
          executable,
          'test',
          fixture,
          '--run',
          '--reporter=json',
          '--outputFile=' + join(output, 'cases.json'),
        ]
  const owner = await runOwnedNode(args, {
    cwd: fixture,
    env,
    auditDir: join(output, 'owners'),
    timeoutMs: 120000,
  })
  writeFileSync(
    join(output, 'owner.json'),
    JSON.stringify(owner, null, 2) + '\n'
  )
  writeFileSync(join(output, 'stdout.log'), owner.stdout)
  writeFileSync(join(output, 'stderr.log'), owner.stderr)
  if (existsSync(join(fixture, 'coverage')))
    cpSync(join(fixture, 'coverage'), join(output, 'coverage'), {
      recursive: true,
    })
  assertOwnedNodeCompleted(
    owner,
    'actual shared afterAll caller payload ' + kind
  )
  assert.equal(owner.status, 0, owner.stderr)
  const report = JSON.parse(readFileSync(join(output, 'cases.json')))
  for (const [key, value] of Object.entries({
    numFailedTests: 0,
    numPassedTests: 3,
    numTotalTests: 3,
    numFailedTestSuites: 0,
    numPassedTestSuites: 3,
    numTotalTestSuites: 3,
    success: true,
  }))
    assert.equal(report[key], value, key)
  assert(
    report.testResults.every(
      (file) =>
        file.status === 'passed' &&
        file.assertionResults.every((test) => test.status === 'passed')
    )
  )
  for (const name of [
    'coverage-final.json',
    'coverage-summary.json',
    'lcov.info',
  ]) {
    const text = readFileSync(
      join(output, 'coverage', name),
      'utf8'
    ).replaceAll(fixture, '<FIXTURE>')
    if (name.endsWith('.json'))
      assert.deepEqual(JSON.parse(text), pristine.reports[name])
    else assert.equal(text, pristine.reports[name])
  }
  writeFileSync(
    join(output, 'VERIFIED.json'),
    JSON.stringify(
      {
        phase,
        kind,
        exit: owner.status,
        passedCases: 3,
        failedFiles: 0,
        completeCoverageReports: true,
        noNativeRejection: true,
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
