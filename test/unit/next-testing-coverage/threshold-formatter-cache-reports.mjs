import assert from 'node:assert/strict'
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  existsSync,
  rmSync,
} from 'node:fs'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'
const consumer = resolve(process.argv[2]),
  output = resolve(process.argv[3]),
  require = createRequire(join(consumer, 'package.json')),
  fixture = mkdtempSync(join(consumer, '.formatter-cache-'))
mkdirSync(output, { recursive: true })
if (!process.argv.includes('--source'))
  for (const name of ['vitest', 'vite', '@vitest/mocker'])
    assert.throws(() => require.resolve(name))
const files = {
  'package.json': '{"private":true,"type":"module"}\n',
  'contract.test.mjs':
    "import {test,expect} from 'vitest'\ntest('completed case still owns cleanup',()=>expect(1).toBe(1))\n",
  'setup.mjs':
    "import {appendFileSync} from 'node:fs'\nexport default function(){appendFileSync('lifecycle.jsonl',JSON.stringify({kind:'setup'})+'\\n');return()=>{appendFileSync('lifecycle.jsonl',JSON.stringify({kind:'teardown'})+'\\n');throw new Error('actual disabled formatter teardown failure')}}\n",
  'vitest.config.mjs':
    "import {appendFileSync} from 'node:fs'\nexport default {test:{include:['contract.test.mjs'],globalSetup:['./setup.mjs'],coverage:{enabled:false,provider:'v8',thresholds:{autoUpdate:()=>{appendFileSync('formatter-called.txt','called');return 1}}}}}\n",
  'next.config.mjs':
    'export default ' +
    JSON.stringify({ turbopack: { root: consumer } }) +
    '\n',
}
try {
  for (const [name, source] of Object.entries(files))
    writeFileSync(join(fixture, name), source)
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
      require.resolve('next/dist/bin/next'),
      'test',
      fixture,
      '--run',
      '--cache',
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
  assertOwnedNodeCompleted(owner, 'disabled formatter cache cleanup')
  const cache = join(fixture, '.next-test-cache/results.json'),
    result = {
      exitCode: owner.status,
      formatterCalled: existsSync(join(fixture, 'formatter-called.txt')),
      cachePublished: existsSync(cache),
      cache: existsSync(cache) ? JSON.parse(readFileSync(cache)) : null,
      lifecycle: existsSync(join(fixture, 'lifecycle.jsonl'))
        ? readFileSync(join(fixture, 'lifecycle.jsonl'), 'utf8')
        : null,
      caseReport: existsSync(join(output, 'cases.json'))
        ? JSON.parse(readFileSync(join(output, 'cases.json')))
        : null,
      reportsExist: existsSync(join(fixture, 'coverage')),
      files,
    }
  writeFileSync(
    join(output, 'MEASUREMENT.json'),
    JSON.stringify(result, null, 2) + '\n'
  )
  assert.equal(result.exitCode, 1)
  assert.equal(result.formatterCalled, false)
  assert.equal(result.cachePublished, false)
  assert.equal(result.reportsExist, false)
  assert(owner.stderr.includes('actual disabled formatter teardown failure'))
  assert.deepEqual(
    result.lifecycle
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line)),
    [{ kind: 'setup' }, { kind: 'teardown' }]
  )
  assert.equal(result.caseReport.numPassedTests, 1)
  assert.equal(result.caseReport.numFailedTests, 0)
  assert.equal(
    result.caseReport.testResults[0].assertionResults[0].status,
    'passed'
  )
  const started = result.caseReport.next.events.filter(
    (event) => event.type === 'file-start'
  )
  assert(started.length > 0)
  assert(started.every((event) => event.entry.profile.mode === 'development'))
  writeFileSync(
    join(output, 'CHECKS.json'),
    JSON.stringify(
      {
        status: 'passed',
        casePassed: true,
        teardownFailed: true,
        formatterNotCalled: true,
        cacheNotPublished: true,
        noCoveragePublished: true,
        teardownOnce: true,
      },
      null,
      2
    ) + '\n'
  )
  console.log(
    JSON.stringify({
      exitCode: result.exitCode,
      cachePublished: result.cachePublished,
      formatterCalled: result.formatterCalled,
      reportsExist: result.reportsExist,
      lifecycle: result.lifecycle,
    })
  )
} finally {
  rmSync(fixture, { recursive: true, force: true })
  writeFileSync(
    join(output, 'CLOSED.json'),
    JSON.stringify({ fixtureRemoved: !existsSync(fixture) }, null, 2) + '\n'
  )
}
