import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'

const [consumerArg, outputArg] = process.argv.slice(2)
assert(consumerArg && outputArg, 'Expected consumer and owned output directory')
const consumer = path.resolve(consumerArg)
const output = path.resolve(outputArg)
const here = path.dirname(fileURLToPath(import.meta.url))
const load = createRequire(path.join(consumer, 'package.json'))
const next = path.join(
  path.dirname(load.resolve('next/package.json')),
  'dist/bin/next'
)
const source = fs.readFileSync(
  path.join(here, 'fixtures/webkit-runtime.case.mjs.txt')
)
const expected = JSON.parse(
  fs.readFileSync(path.join(here, 'fixtures/webkit-runtime.expected.json.txt'))
)
const prepared = []
const results = []
fs.mkdirSync(output, { recursive: true })
for (const mode of ['development', 'production']) {
  const fixture = fs.mkdtempSync(
    path.join(consumer, '.next-test-webkit-runtime-')
  )
  const destination = path.join(output, mode)
  fs.mkdirSync(destination)
  fs.writeFileSync(path.join(fixture, 'runtime.test.mjs'), source)
  fs.writeFileSync(
    path.join(fixture, 'package.json'),
    '{"type":"module","private":true}\n'
  )
  fs.symlinkSync(
    path.join(consumer, 'node_modules'),
    path.join(fixture, 'node_modules'),
    'dir'
  )
  fs.writeFileSync(
    path.join(fixture, 'next.config.mjs'),
    `export default ${JSON.stringify({ turbopack: { root: consumer } })}\n`
  )
  fs.writeFileSync(
    path.join(fixture, 'next.test.config.json'),
    JSON.stringify({
      maxWorkers: 1,
      projects: [
        {
          name: 'webkit',
          environment: 'browser',
          mode,
          browser: {
            enabled: true,
            headless: true,
            instances: [{ browser: 'webkit' }],
          },
          include: ['runtime.test.mjs'],
          testTimeout: 1000,
          hookTimeout: 1000,
          includeTaskLocation: false,
        },
      ],
    }) + '\n'
  )
  prepared.push({ mode, fixture, destination, started: false, joined: false })
}
try {
  for (const record of prepared) {
    const { mode, fixture, destination } = record
    const report = path.join(destination, 'result.json')
    const env = {
      ...process.env,
      NODE_ENV: mode,
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
    record.started = true
    const owner = await runOwnedNode(
      [
        next,
        'test',
        fixture,
        '--run',
        '--reporter=json',
        '--outputFile=' + report,
      ],
      {
        cwd: fixture,
        env,
        auditDir: path.join(destination, 'owners'),
        timeoutMs: 120000,
      }
    )
    fs.writeFileSync(
      path.join(destination, 'owner.json'),
      JSON.stringify(owner, null, 2)
    )
    fs.writeFileSync(path.join(destination, 'stdout.log'), owner.stdout)
    fs.writeFileSync(path.join(destination, 'stderr.log'), owner.stderr)
    assertOwnedNodeCompleted(owner, mode)
    record.joined = true
    const raw = JSON.parse(fs.readFileSync(report))
    const actual = {
      mode,
      exit: owner.status,
      success: raw.success,
      cases: raw.testResults
        .flatMap((file) => file.assertionResults)
        .map((test) => ({
          name: test.fullName,
          status: test.status,
          failureMessages: test.failureMessages,
        })),
      rows: raw.next.events
        .filter((event) => event.type === 'output')
        .flatMap((event) =>
          event.text
            .split('\n')
            .filter((line) => line.startsWith('WEBKIT_RUNTIME:'))
            .map((line) => JSON.parse(line.slice('WEBKIT_RUNTIME:'.length)))
        ),
      allOwnersClosed: true,
    }
    fs.writeFileSync(
      path.join(destination, 'comparison.json'),
      JSON.stringify(actual, null, 2)
    )
    assert.deepEqual(
      actual,
      expected.profiles.find((profile) => profile.mode === mode)
    )
    results.push(actual)
  }
} finally {
  for (const record of prepared)
    if (!record.started || record.joined)
      fs.rmSync(record.fixture, { recursive: true, force: true })
}
fs.writeFileSync(
  path.join(output, 'verified.json'),
  JSON.stringify(
    {
      referenceVersion: expected.referenceVersion,
      profiles: results.length,
      cases: results.flatMap((result) => result.cases).length,
      fullAuthoredRowsAndCaseProjectionsMatch: true,
      allOwnersClosed: true,
      wholeStandardReportsRetainedWithoutEqualityClaim: true,
    },
    null,
    2
  )
)
console.log(
  JSON.stringify({ profiles: results.length, cases: 6, allPassed: true })
)
