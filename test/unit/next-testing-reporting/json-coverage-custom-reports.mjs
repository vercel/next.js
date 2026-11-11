import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { assertCoveragePublication } from './json-coverage-custom-contract.mjs'
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  readdirSync,
  existsSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'
const [rootArg, outputArg, name] = process.argv.slice(2)
assert(rootArg && outputArg && name)
const root = resolve(rootArg),
  output = resolve(outputArg),
  here = dirname(fileURLToPath(import.meta.url)),
  source = process.argv.includes('--source'),
  load = createRequire(join(root, 'package.json'))
assert(
  [
    'close',
    'config-close',
    'end',
    'end-close',
    'end-config-close',
    'success',
  ].includes(name),
  'Unknown custom coverage reporter profile'
)
const inputs = join(here, 'fixtures/json-coverage-custom')
if (!source)
  for (const name of ['vitest', 'vite', '@vitest/mocker'])
    assert.throws(() => load.resolve(name))
const fixture = mkdtempSync(join(root, '.next-custom-coverage-json-'))
mkdirSync(output, { recursive: true })
let joined = false
try {
  const files = {
    'package.json': 'package.json',
    'subject.mjs': 'subject.mjs',
    'suite.test.mjs': 'suite.test.mjs',
    'vitest.config.mjs': 'vitest.config.mjs',
    'setup.mjs': name.includes('config') ? 'setup-throw.mjs' : 'setup.mjs',
    'reporter.mjs':
      'reporter-' +
      (name.includes('end')
        ? name.includes('close')
          ? 'end-close'
          : 'end'
        : name.includes('close')
          ? 'close'
          : 'success') +
      '.mjs',
  }
  for (const [file, input] of Object.entries(files))
    writeFileSync(join(fixture, file), readFileSync(join(inputs, input)))
  writeFileSync(
    join(fixture, 'next.config.mjs'),
    'export default ' + JSON.stringify({ turbopack: { root } }) + '\n'
  )
  const env = {
    ...process.env,
    NODE_ENV: 'development',
    NEXT_TELEMETRY_DISABLED: '1',
    FORCE_COLOR: '0',
    TURBO_TASKS_AVAILABLE_PARALLELISM: '4',
  }
  for (const key of [
    'CI',
    'NODE_OPTIONS',
    'NODE_PATH',
    'NEXT_TEST_NATIVE_DIR',
    'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
  ])
    delete env[key]
  const owner = await runOwnedNode(
    [
      source
        ? join(root, 'packages/next/dist/bin/next')
        : load.resolve('next/dist/bin/next'),
      'test',
      fixture,
      '--run',
      '--reporter=json',
      '--reporter=./reporter.mjs',
      '--outputFile=cases.json',
    ],
    { cwd: fixture, env, timeoutMs: 120000, auditDir: join(output, 'owners') }
  )
  writeFileSync(
    join(output, 'owner.json'),
    JSON.stringify(owner, null, 2) + '\n'
  )
  writeFileSync(join(output, 'stdout.log'), owner.stdout)
  writeFileSync(join(output, 'stderr.log'), owner.stderr)
  assertOwnedNodeCompleted(
    owner,
    'Actual JSON coverage custom reporter ' + name
  )
  joined = true
  const report = JSON.parse(readFileSync(join(fixture, 'cases.json'), 'utf8'))
  writeFileSync(
    join(output, 'cases.json'),
    JSON.stringify(report, null, 2) + '\n'
  )
  const trace = readFileSync(join(fixture, 'trace.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(JSON.parse)
  writeFileSync(
    join(output, 'trace.jsonl'),
    trace.map((value) => JSON.stringify(value)).join('\n') + '\n'
  )
  const coverageFiles = existsSync(join(fixture, 'coverage'))
    ? readdirSync(join(fixture, 'coverage'))
        .filter((name) => !name.startsWith('.tmp'))
        .sort()
    : []
  assertCoveragePublication({
    name,
    fixture,
    status: owner.status,
    report,
    trace,
    coverageFiles,
    stderr: owner.stderr,
  })
  writeFileSync(
    join(output, 'CHECKS.json'),
    JSON.stringify(
      {
        name,
        caseResultsAndCoveragePublication: true,
        exactCallbackAndFileOrder: true,
        allIndependentAuthoredErrorsRetained: true,
        ownedProcessTreeClosed: true,
      },
      null,
      2
    ) + '\n'
  )
} finally {
  if (joined) rmSync(fixture, { recursive: true, force: true })
  writeFileSync(
    join(output, 'CLOSED.json'),
    JSON.stringify({
      fixture,
      fixtureRetired: joined,
      originalOwnershipChecksPassed: joined,
    }) + '\n'
  )
}
