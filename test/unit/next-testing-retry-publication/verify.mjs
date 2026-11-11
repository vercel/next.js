import assert from 'node:assert/strict'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'

const [consumerArg, outputArg] = process.argv.slice(2)
assert(consumerArg && outputArg, 'Expected a project root and output directory')
const consumer = realpathSync(consumerArg)
const output = resolve(outputArg)
const directory = dirname(fileURLToPath(import.meta.url))
const load = createRequire(join(consumer, 'package.json'))
mkdirSync(output)
const profiles = []
for (const mode of ['development', 'production']) {
  const evidence = join(output, mode)
  mkdirSync(evidence)
  const fixture = mkdtempSync(join(consumer, '.next-test-retry-publication-'))
  mkdirSync(join(fixture, 'cases'))
  for (const name of readdirSync(join(directory, 'cases')))
    copyFileSync(
      join(directory, 'cases', name),
      join(fixture, 'cases', name.replace(/\.txt$/, ''))
    )
  symlinkSync(
    join(consumer, 'node_modules'),
    join(fixture, 'node_modules'),
    'dir'
  )
  writeFileSync(
    join(fixture, 'package.json'),
    '{"private":true,"type":"module"}\n'
  )
  writeFileSync(
    join(fixture, 'next.config.mjs'),
    'export default ' + JSON.stringify({ turbopack: { root: consumer } }) + '\n'
  )
  writeFileSync(
    join(fixture, 'vitest.config.mjs'),
    'export default ' +
      JSON.stringify({
        test: {
          mode,
          environment: 'node',
          include: ['cases/*.test.mjs'],
          provide: { value: 0 },
          maxWorkers: 1,
          fileParallelism: false,
          cache: false,
          testTimeout: 5000,
          hookTimeout: 5000,
          retry: { count: 1, metadata: 'config' },
        },
      }) +
      '\n'
  )
  copyFileSync(join(directory, 'reporter.mjs'), join(fixture, 'reporter.mjs'))
  const reporterResult = join(evidence, 'reporter-result.json')
  const reportFile = join(evidence, 'report.json')
  const env = {
    ...process.env,
    NODE_ENV: mode,
    NEXT_TELEMETRY_DISABLED: '1',
    FORCE_COLOR: '0',
  }
  for (const key of [
    'CI',
    'NODE_OPTIONS',
    'NODE_PATH',
    'NEXT_TEST_NATIVE_DIR',
    'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
  ])
    delete env[key]
  env.NEXT_TESTING_RETRY_PUBLICATION_RESULT = reporterResult
  let joined = false
  try {
    const result = await runOwnedNode(
      [
        load.resolve('next/dist/bin/next'),
        'test',
        fixture,
        '--run',
        '--reporter=json',
        '--reporter=' + join(fixture, 'reporter.mjs'),
        '--outputFile=' + reportFile,
      ],
      {
        cwd: fixture,
        env,
        auditDir: join(evidence, 'owners'),
        timeoutMs: 180000,
      }
    )
    writeFileSync(join(evidence, 'stdout.log'), result.stdout)
    writeFileSync(join(evidence, 'stderr.log'), result.stderr)
    assertOwnedNodeCompleted(result, mode + ' retry publication')
    joined = true
    assert.equal(result.status, 0, result.stderr)
    const report = JSON.parse(readFileSync(reportFile, 'utf8'))
    assert.equal(report.success, true)
    assert.equal(report.numTotalTests, 8)
    assert.equal(report.numPassedTests, 8)
    assert.equal(report.numFailedTests, 0)
    const cases = report.testResults.flatMap((file) =>
      file.assertionResults.map((test) => ({ file: file.name, ...test }))
    )
    assert.equal(cases.length, 8)
    assert.deepEqual(
      [...new Set(cases.map((test) => basename(test.file)))].sort(),
      readdirSync(join(directory, 'cases'))
        .map((name) => name.replace(/\.txt$/, ''))
        .sort()
    )
    for (const test of cases) {
      assert.equal(test.status, 'passed', test.fullName)
      assert.equal(
        test.failureMessages.length,
        test.fullName === 'worker live retry count' ? 2 : 0
      )
    }
    assert.deepEqual(JSON.parse(readFileSync(reporterResult, 'utf8')), {
      collected: 8,
      ended: 8,
    })
    profiles.push({ mode, cases: cases.length })
  } finally {
    if (joined) {
      rmSync(fixture, { recursive: true, force: true })
      assert(!existsSync(fixture), 'The completed fixture must be removed')
    }
  }
}
writeFileSync(
  join(output, 'VERIFIED.json'),
  JSON.stringify(
    {
      profiles: profiles.length,
      runs: profiles,
      cases: profiles.reduce((n, p) => n + p.cases, 0),
      behavioralChecks: true,
      allOwnersJoined: true,
    },
    null,
    2
  ) + '\n'
)
