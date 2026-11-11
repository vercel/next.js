import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from 'node:fs'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'
const [mode, profile, output, installedConsumer] = process.argv.slice(2)
const local = dirname(fileURLToPath(import.meta.url))
const projectRoot = installedConsumer ?? resolve(local, '../../..')
const require = createRequire(join(projectRoot, 'package.json'))
if (installedConsumer)
  for (const name of ['vitest', 'vite', '@vitest/mocker'])
    assert.throws(() => require.resolve(name), { code: 'MODULE_NOT_FOUND' })
assert(['development', 'production'].includes(mode))
const fixtures = join(local, 'fixtures/junit-suite-occurrences')
const expected = JSON.parse(
  readFileSync(join(fixtures, 'expected.json'), 'utf8')
)[profile]
assert(expected)
mkdirSync(output, { recursive: true })
const fixture = mkdtempSync(join(projectRoot, '.next-test-junit-suite-public-'))
try {
  const source = readFileSync(join(fixtures, profile + '.case.mjs'))
  writeFileSync(join(fixture, 'modes.case.mjs'), source)
  writeFileSync(
    join(fixture, 'package.json'),
    '{"private":true,"type":"module"}\n'
  )
  writeFileSync(
    join(fixture, 'vitest.config.mjs'),
    'export default ' +
      JSON.stringify({
        test: {
          include: ['*.case.mjs'],
          cache: false,
          maxWorkers: 1,
          testTimeout: 5000,
          sequence: { seed: 1 },
          mode,
          environment: 'node',
        },
      }) +
      '\n'
  )
  const env = {
    ...process.env,
    NODE_ENV: mode,
    CI: '1',
    FORCE_COLOR: '0',
    NEXT_TELEMETRY_DISABLED: '1',
    TURBO_TASKS_AVAILABLE_PARALLELISM: '4',
    DURATION_NEXT_ROOT: projectRoot,
    NEXT_TEST_EVENT_AUDIT: join(output, 'events.jsonl'),
    HOOK_TRACE: join(output, 'authors.jsonl'),
    GETTER_TRACE: join(output, 'authors.jsonl'),
  }
  delete env.NODE_OPTIONS
  delete env.NODE_PATH
  const result = await runOwnedNode(
    [
      '--require',
      join(local, 'junit-suite-events.cjs'),
      require.resolve('next/dist/bin/next'),
      'test',
      fixture,
      '--reporter=junit',
      '--outputFile=' + join(output, 'cases.xml'),
    ],
    { cwd: fixture, env, auditDir: join(output, 'owners'), timeoutMs: 120000 }
  )
  writeFileSync(
    join(output, 'RESULT.json'),
    JSON.stringify(result, null, 2) + '\n'
  )
  writeFileSync(join(output, 'stdout.log'), result.stdout)
  writeFileSync(join(output, 'stderr.log'), result.stderr)
  assertOwnedNodeCompleted(
    result,
    'actual cached JUnit suite ' + mode + ' ' + profile
  )
  assert.equal(result.status, expected.status, result.stderr)
  const effects = readFileSync(join(output, 'authors.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map(JSON.parse)
  assert.deepEqual(effects, expected.effects, 'entire original effect stream')
  const xml = readFileSync(join(output, 'cases.xml'), 'utf8'),
    suite = /<testsuite\s+([^>]+)>/.exec(xml)[1]
  const attr = (name) => new RegExp('\\b' + name + '="([^"]+)"').exec(suite)[1]
  assert.equal(Number(attr('tests')), expected.tests)
  assert.equal(Number(attr('failures')), expected.failedSuites)
  assert.equal(attr('errors'), '0')
  assert.equal(Number(attr('skipped')), expected.skipped)
  assert.equal((xml.match(/<failure /g) || []).length, expected.failureElements)
  assert(!xml.includes('[file error]'))
  const events = readFileSync(join(output, 'events.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map(JSON.parse),
    actual = events.filter(
      (event) => event.type === 'suite-end' && event.reportedTask
    )
  assert.equal(actual.length, expected.failedSuites)
  for (const event of actual) {
    assert.equal(event.reportedTask.id, event.suiteId)
    assert.equal(event.reportedTask.errors.length, expected.failureElements)
  }
  const observed = {
    status: 'passed',
    mode,
    profile,
    actualSuiteCounts: true,
    orderedErrorOccurrences: true,
    originalGetterEffectsHeld: true,
    allOwnersJoined: true,
    fullXMLParityQualified: false,
    stackFramePresentationRemainsOpen: true,
    installed: !!installedConsumer,
    version: process.version,
    versions: process.versions,
    execPath: process.execPath,
  }
  writeFileSync(
    join(output, 'observed.json'),
    JSON.stringify(observed, null, 2) + '\n'
  )
  console.log(JSON.stringify(observed))
} finally {
  rmSync(fixture, { recursive: true, force: true })
}
