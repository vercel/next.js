import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'

const [consumerArg, outputArg, name] = process.argv.slice(2)
assert(consumerArg && outputArg && name)
const consumer = resolve(consumerArg)
const output = resolve(outputArg)
const load = createRequire(join(consumer, 'package.json'))
const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')
if (!process.argv.includes('--source'))
  for (const module of ['vitest', 'vite', '@vitest/mocker'])
    assert.throws(() => load.resolve(module))
const names = [
  'getter-reject',
  'getter-close-throw',
  'getter-reject-close-throw',
  'invalid-reject',
  'invalid-close-throw',
  'invalid-reject-close-throw',
]
assert(names.includes(name), 'Unknown pending completion scenario')
const kind = name.startsWith('getter-') ? 'getter' : 'invalid'
const variant = name.slice(kind.length + 1)
const reporterFiles = new Map([
  ['first.mjs', variant + '.mjs'],
  ['second.mjs', kind + '.mjs'],
  ['third.mjs', 'third.mjs'],
])
fs.mkdirSync(output, { recursive: true })
const fixture = fs.mkdtempSync(
  join(consumer, '.next-custom-access-pending416-')
)
let joined = false
try {
  const sourceFiles = new Map()
  for (const file of [
    'coverage-provider.mjs',
    'contract.case.mjs',
    'vitest.config.mjs',
  ])
    sourceFiles.set(
      file,
      fs.readFileSync(join(fixtures, 'custom-reporter-completion', file))
    )
  for (const [file, source] of reporterFiles)
    sourceFiles.set(
      file,
      fs.readFileSync(join(fixtures, 'custom-access-pending', source))
    )
  for (const [file, bytes] of sourceFiles)
    fs.writeFileSync(join(fixture, file), bytes)
  fs.writeFileSync(join(fixture, 'package.json'), '{}\n')
  fs.writeFileSync(
    join(fixture, 'next.config.mjs'),
    'export default ' + JSON.stringify({ turbopack: { root: consumer } }) + '\n'
  )
  fs.mkdirSync(join(fixture, '__snapshots__'))
  const env = {
    ...process.env,
    CI: '1',
    NODE_ENV: 'development',
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
      load.resolve('next/dist/bin/next'),
      'test',
      fixture,
      '--run',
      ...[...reporterFiles.keys(), 'json'].map(
        (value) =>
          '--reporter=' +
          (value.endsWith('.mjs') ? join(fixture, value) : value)
      ),
      '--outputFile=' + join(fixture, 'cases.json'),
    ],
    { cwd: fixture, env, auditDir: join(output, 'owners'), timeoutMs: 120000 }
  )
  fs.writeFileSync(
    join(output, 'owner.json'),
    JSON.stringify(owner, null, 2) + '\n'
  )
  fs.writeFileSync(join(output, 'stdout.log'), owner.stdout)
  fs.writeFileSync(join(output, 'stderr.log'), owner.stderr)
  assertOwnedNodeCompleted(owner, 'custom reporter ' + name)
  joined = true
  for (const file of [
    'provider-trace.jsonl',
    'cases.json',
    'custom-coverage.json',
  ])
    if (fs.existsSync(join(fixture, file)))
      fs.copyFileSync(join(fixture, file), join(output, file))
  const trace = fs.existsSync(join(fixture, 'provider-trace.jsonl'))
    ? fs
        .readFileSync(join(fixture, 'provider-trace.jsonl'), 'utf8')
        .trim()
        .split('\n')
        .map(JSON.parse)
    : []
  assert.equal(owner.status, 1)
  const providerPhases = [
    'get-provider',
    'initialize',
    'resolve',
    'clean',
    'run-start',
    'start',
    'take',
    'suite',
    'stop',
    'generate',
  ]
  assert.deepEqual(
    trace.slice(0, providerPhases.length).map((event) => event.name),
    providerPhases
  )
  assert.deepEqual(trace[7], {
    name: 'suite',
    coverage: { releasePayload: 42 },
    testFiles: ['contract.case.mjs'],
  })
  assert.deepEqual(trace[9], { name: 'generate', jsonExists: false })
  const callbackPhases = [
    'first-enter',
    ...(kind === 'getter' ? ['second-getter'] : []),
    'first-close',
    'first-settled',
  ]
  assert.deepEqual(
    trace.slice(providerPhases.length).map((event) => event.name),
    callbackPhases
  )
  for (const event of trace.slice(providerPhases.length))
    assert.equal(event.jsonExists, false)
  assert.equal(fs.existsSync(join(fixture, 'cases.json')), false)
  assert.equal(fs.existsSync(join(fixture, 'custom-coverage.json')), false)

  for (const [file, bytes] of sourceFiles)
    assert.deepEqual(fs.readFileSync(join(fixture, file)), bytes)
  assert.deepEqual(fs.readdirSync(join(fixture, '__snapshots__')), [])
  fs.writeFileSync(
    join(output, 'CHECKS.json'),
    JSON.stringify({
      name,
      completionOrderChecked: true,
      publicationChecked: true,
      allActualProcessesJoined: true,
    }) + '\n'
  )
} finally {
  if (joined) fs.rmSync(fixture, { recursive: true, force: true })
  fs.writeFileSync(
    join(output, 'CLOSED.json'),
    JSON.stringify({
      physicallyJoined: joined,
      fixtureRetired: !fs.existsSync(fixture),
    }) + '\n'
  )
}
