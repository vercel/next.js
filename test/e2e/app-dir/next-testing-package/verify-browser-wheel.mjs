import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from './process-supervisor.mjs'

const [consumerArg, outputArg] = process.argv.slice(2)
assert(
  consumerArg && outputArg,
  'Usage: node verify-browser-wheel.mjs <installed-consumer> <new-evidence-dir>'
)
const consumer = realpathSync(consumerArg)
const output = resolve(outputArg)
mkdirSync(output)
const directory = dirname(fileURLToPath(import.meta.url))
const corpus = resolve(
  directory,
  '../../../unit/next-testing-browser-resources/fixtures/user-event-wheel'
)
const expected = JSON.parse(
  readFileSync(join(directory, 'browser-wheel.expected.json'), 'utf8')
)
const require = createRequire(join(consumer, 'package.json'))
const versions = {}
for (const name of ['next', 'playwright', 'react', 'react-dom']) {
  const path = realpathSync(require.resolve(`${name}/package.json`))
  const installedPath = relative(join(consumer, 'node_modules'), path)
  assert(
    !isAbsolute(installedPath) &&
      installedPath !== '..' &&
      !installedPath.startsWith('..' + sep),
    `${name} must resolve from the physical consumer installation`
  )
  versions[name] = JSON.parse(readFileSync(path, 'utf8')).version
}
for (const name of ['vitest', 'vite'])
  assert.throws(() => require.resolve(name), `${name} must not be installed`)
const next = require.resolve('next/dist/bin/next')
const save = (directory, name, value) =>
  writeFileSync(join(directory, name), JSON.stringify(value, null, 2) + '\n')
save(output, 'inputs.json', {
  runtime: process.version,
  executable: realpathSync(process.execPath),
  versions,
  reference: expected.reference,
})
const digest = (path) =>
  createHash('sha256').update(readFileSync(path)).digest('hex')
const env = { ...process.env, NEXT_TELEMETRY_DISABLED: '1' }
for (const key of [
  'NODE_OPTIONS',
  'NODE_PATH',
  'NEXT_TEST_NATIVE_DIR',
  'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
])
  delete env[key]

async function verify(name, expectation) {
  const { mode } = expectation
  const evidence = join(output, name)
  mkdirSync(evidence)
  const fixture = join(consumer, `.next-test-rendering-${randomUUID()}`)
  mkdirSync(fixture)
  mkdirSync(join(fixture, 'cases'))
  mkdirSync(join(fixture, 'app'))
  const sources = {}
  for (const [source, target] of [['wheel.test.mjs.txt', 'wheel.test.mjs']]) {
    const destination = join(fixture, 'cases', target)
    copyFileSync(join(corpus, source), destination)
    sources[target] = digest(destination)
  }
  writeFileSync(
    join(fixture, 'package.json'),
    JSON.stringify({ private: true, type: 'module' })
  )
  writeFileSync(join(fixture, 'next.config.mjs'), 'export default {}\n')
  writeFileSync(
    join(fixture, 'app/layout.jsx'),
    "import React from 'react';export default function Layout({children}) { return <html><body>{children}</body></html> }\n"
  )
  writeFileSync(
    join(fixture, 'app/page.jsx'),
    'export default function Page() { return <p>Component rendering</p> }\n'
  )
  writeFileSync(
    join(fixture, 'next.test.config.json'),
    JSON.stringify({
      maxWorkers: 1,
      projects: [
        {
          name,
          mode,
          fileTimeout: 60000,
          include: ['cases/*.test.mjs'],
          browser: { enabled: true, viewport: { width: 640, height: 480 } },
        },
      ],
    })
  )
  save(evidence, 'sources.json', sources)
  const args = [
    next,
    'test',
    fixture,
    '--run',
    '--reporter',
    'json',
    '--outputFile',
    join(evidence, 'report.raw.json'),
  ]
  const result = await runOwnedNode(args, {
    cwd: consumer,
    env: { ...env, NODE_ENV: mode },
    auditDir: join(evidence, 'processes'),
    timeoutMs: 120000,
  })
  writeFileSync(join(evidence, 'stdout.log'), result.stdout)
  writeFileSync(join(evidence, 'stderr.log'), result.stderr)
  save(evidence, 'command.json', { args, status: result.status })
  assertOwnedNodeCompleted(result, name)
  assert.equal(result.status, 0)
  const report = JSON.parse(
    readFileSync(join(evidence, 'report.raw.json'), 'utf8')
  )
  const cases = report.testResults.flatMap((file) =>
    file.assertionResults.map(({ fullName, status, failureMessages }) => ({
      fullName,
      status,
      failureMessages,
    }))
  )
  const rows = []
  for (const event of report.next.events) {
    if (event.type !== 'output') continue
    for (const line of event.text.split('\n'))
      if (line.startsWith('WHEEL_RAW '))
        rows.push({
          stream: event.stream,
          row: JSON.parse(line.slice('WHEEL_RAW '.length)),
        })
  }
  save(evidence, 'actual-cases.json', cases)
  save(evidence, 'actual-rows.json', rows)
  assert.deepEqual(cases, expectation.cases)
  assert.deepEqual(rows, expectation.rows)
  assert.equal(report.numTotalTests, 4)
  assert.equal(report.numPassedTests, 4)
  assert.equal(report.testResults.length, 1)
  assert.equal(report.testResults[0].status, 'passed')
  assert.equal(report.testResults[0].message, '')
  assert.deepEqual(
    report.next.events
      .filter((event) => event.type === 'file-start')
      .map((event) => event.entry.profile),
    [
      {
        id: name,
        environment: 'browser',
        mode,
        runtime: 'nodejs',
        bundler: 'turbopack',
        browserClient: true,
      },
    ]
  )
  for (const [file, hash] of Object.entries(sources))
    assert.equal(digest(join(fixture, 'cases', file)), hash)
  rmSync(fixture, { recursive: true })
  return { name, mode, cases: cases.length, fullRows: rows.length }
}

const results = await Promise.allSettled(
  Object.entries(expected.phases).map(([name, phase]) => verify(name, phase))
)
save(output, 'results.json', results)
const failures = results.flatMap((result) =>
  result.status === 'rejected' ? [result.reason] : []
)
if (failures.length)
  throw new globalThis.AggregateError(failures, 'Browser wheel')
console.log('Installed Browser wheel: 2 profiles, 8 cases/full rows match')
