import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'
const [rootArg, outputArg, profile] = process.argv.slice(2)
assert(rootArg && outputArg && ['configuration', 'transform'].includes(profile))
const root = resolve(rootArg),
  output = resolve(outputArg),
  here = dirname(fileURLToPath(import.meta.url)),
  corpus = join(here, 'fixtures/configuration-loss')
const source = process.argv.includes('--source'),
  load = createRequire(join(root, 'package.json'))
if (!source)
  for (const name of ['vitest', 'vite', '@vitest/mocker'])
    assert.throws(() => load.resolve(name))
const fixture = mkdtempSync(join(root, '.next-coverage-config-loss-')),
  sha = (bytes) => createHash('sha256').update(bytes).digest('hex'),
  pins = {}
mkdirSync(output, { recursive: true })
let joined = false
try {
  for (const name of ['contract.test.mjs', 'setup.mjs', 'subject.mjs']) {
    const bytes = readFileSync(join(corpus, name + '.txt'))
    writeFileSync(join(fixture, name), bytes)
    pins[name] = sha(bytes)
  }
  const config = readFileSync(join(corpus, profile + '.mjs.txt'))
  writeFileSync(join(fixture, 'vitest.config.mjs'), config)
  pins['vitest.config.mjs'] = sha(config)
  writeFileSync(
    join(fixture, 'next.config.mjs'),
    'export default ' + JSON.stringify({ turbopack: { root } }) + '\n'
  )
  const priorJSON = 'owned previous complete JSON report\n',
    priorCoverage = 'owned previous complete coverage report\n'
  writeFileSync(join(fixture, 'cases.json'), priorJSON)
  mkdirSync(join(fixture, 'coverage'))
  writeFileSync(join(fixture, 'coverage/coverage-final.json'), priorCoverage)
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
  assertOwnedNodeCompleted(owner, 'Actual configuration loss veto ' + profile)
  joined = true
  assert.equal(owner.status, 1)
  assert.equal(
    readFileSync(join(fixture, 'body-completed.txt'), 'utf8'),
    'completed'
  )
  assert.equal(readFileSync(join(fixture, 'cases.json'), 'utf8'), priorJSON)
  assert.equal(
    readFileSync(join(fixture, 'coverage/coverage-final.json'), 'utf8'),
    priorCoverage
  )
  assert(
    owner.stderr.includes('Test configuration session ended unexpectedly'),
    owner.stderr
  )
  assert.equal(
    owner.stderr.split('Test configuration session ended unexpectedly').length -
      1,
    1,
    'One latched configuration failure must have one owner'
  )
  for (const [name, pin] of Object.entries(pins))
    assert.equal(sha(readFileSync(join(fixture, name))), pin)
  writeFileSync(
    join(output, 'CHECKS.json'),
    JSON.stringify(
      {
        profile,
        actualPassingBodyCompleted: true,
        actualConfigurationFailureRetained: true,
        priorJSONAndCoverageBytesHeld: true,
        realTransformHost: profile === 'transform',
        authoredBytesHeld: true,
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
