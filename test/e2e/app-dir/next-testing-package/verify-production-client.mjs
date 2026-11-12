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
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from './process-supervisor.mjs'

// A client entry in a real production browser graph, separate from the
// production-browser phase's Node application driver in verify-stage3.mjs.
const [consumerArg, outputArg] = process.argv.slice(2)
assert(
  consumerArg && outputArg,
  'Usage: node verify-production-client.mjs <installed-consumer> <new-evidence-dir>'
)
const consumer = realpathSync(consumerArg)
const output = resolve(outputArg)
mkdirSync(output)
const require = createRequire(join(consumer, 'package.json'))
const nextRoot = dirname(require.resolve('next/package.json'))
for (const name of ['next', 'playwright', 'react', 'react-dom']) {
  const path = realpathSync(require.resolve(`${name}/package.json`))
  assert(
    path.startsWith(join(consumer, 'node_modules') + '/'),
    `${name} must resolve from the physical consumer installation`
  )
}
for (const name of ['vitest', 'vite'])
  assert.throws(() => require.resolve(name), `${name} must not be installed`)
const directory = dirname(fileURLToPath(import.meta.url))
const corpus = resolve(
  directory,
  '../../../unit/next-testing-browser-resources/fixtures/production-mode'
)
const expected = JSON.parse(
  readFileSync(join(directory, 'production-client.expected.json'), 'utf8')
)
const fixture = join(consumer, `.next-test-production-client-${randomUUID()}`)
mkdirSync(fixture)
mkdirSync(join(fixture, 'cases'))
mkdirSync(join(fixture, 'app'))
mkdirSync(join(fixture, 'node_modules'))
const dependency = join(fixture, 'node_modules/next-test-production-target')
mkdirSync(dependency)
const inputs = [
  ['browser.test.mjs.txt', 'cases/browser.test.mjs'],
  ['Widget.jsx.txt', 'cases/Widget.jsx'],
  ['widget.module.css.txt', 'cases/widget.module.css'],
  ...[
    'package.json',
    'browser-production.mjs',
    'browser-development.mjs',
    'browser-default.mjs',
    'node.mjs',
    'other.mjs',
  ].map((name) => [
    `conditional-target/${name}${name.endsWith('.mjs') ? '.txt' : ''}`,
    `node_modules/next-test-production-target/${name}`,
  ]),
]
const digest = (path) =>
  createHash('sha256').update(readFileSync(path)).digest('hex')
const sourceHashes = {}
for (const [source, target] of inputs) {
  copyFileSync(join(corpus, source), join(fixture, target))
  sourceHashes[target] = digest(join(fixture, target))
}
writeFileSync(
  join(fixture, 'package.json'),
  JSON.stringify({ private: true, type: 'module' })
)
writeFileSync(join(fixture, 'next.config.mjs'), 'export default {}\n')
writeFileSync(
  join(fixture, 'app/layout.jsx'),
  "import React from 'react'; export default function Layout({children}) { return <html><body>{children}</body></html> }\n"
)
writeFileSync(
  join(fixture, 'app/page.jsx'),
  'export default function Page() { return <p>Production Browser client</p> }\n'
)
writeFileSync(
  join(fixture, 'next.test.config.json'),
  JSON.stringify({
    maxWorkers: 1,
    projects: [
      {
        name: 'production-client',
        mode: 'production',
        fileTimeout: 60000,
        include: ['cases/*.test.mjs'],
        browser: { enabled: true, viewport: { width: 640, height: 480 } },
      },
    ],
  })
)
const save = (name, value) =>
  writeFileSync(join(output, name), JSON.stringify(value, null, 2) + '\n')
save('inputs.json', {
  runtime: process.version,
  executable: realpathSync(process.execPath),
  next: realpathSync(nextRoot),
  sources: sourceHashes,
  reference: expected.reference,
})
const env = {
  ...process.env,
  NODE_ENV: 'production',
  NEXT_TELEMETRY_DISABLED: '1',
}
for (const key of [
  'NODE_OPTIONS',
  'NODE_PATH',
  'NEXT_TEST_NATIVE_DIR',
  'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
])
  delete env[key]
const args = [
  join(nextRoot, 'dist/bin/next'),
  'test',
  fixture,
  '--run',
  '--reporter',
  'json',
  '--outputFile',
  join(output, 'report.raw.json'),
]
const result = await runOwnedNode(args, {
  cwd: consumer,
  env,
  auditDir: join(output, 'processes'),
  timeoutMs: 120000,
})
writeFileSync(join(output, 'stdout.log'), result.stdout)
writeFileSync(join(output, 'stderr.log'), result.stderr)
save('command.json', { args, cwd: consumer, status: result.status })
assertOwnedNodeCompleted(result, 'installed production Browser client')
assert.equal(result.status, 0)
const report = JSON.parse(readFileSync(join(output, 'report.raw.json'), 'utf8'))
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
    if (line.startsWith('USER_EVENT_RAW '))
      rows.push({
        stream: event.stream,
        row: JSON.parse(line.slice('USER_EVENT_RAW '.length)),
      })
}
save('actual-cases.json', cases)
save('actual-rows.json', rows)
assert.deepEqual(cases, expected.cases)
assert.deepEqual(rows, expected.rows)
assert.equal(report.numTotalTests, 8)
assert.equal(report.numPassedTests, 8)
assert.equal(report.testResults.length, 1)
assert.equal(report.testResults[0].status, 'passed')
assert.equal(report.testResults[0].message, '')
assert.deepEqual(
  report.next.events
    .filter((event) => event.type === 'file-start')
    .map((event) => event.entry.profile),
  [
    {
      id: 'production-client',
      environment: 'browser',
      mode: 'production',
      runtime: 'nodejs',
      bundler: 'turbopack',
      browserClient: true,
    },
  ]
)
for (const [path, hash] of Object.entries(sourceHashes))
  assert.equal(digest(join(fixture, path)), hash, `Fixture changed: ${path}`)
rmSync(fixture, { recursive: true })
save('verification.json', {
  cases: cases.length,
  fullRows: rows.length,
  exactReferenceMatch: true,
  fixtureRemoved: true,
  consumer: relative(output, consumer),
})
console.log(
  'Installed production Browser client: 8 cases and 8 full rows match'
)
