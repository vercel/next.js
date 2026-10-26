import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'
const [repoArg, outputArg, mode, form, kind] = process.argv.slice(2)
const repo = fs.realpathSync(repoArg),
  output = path.resolve(outputArg),
  here = path.dirname(fileURLToPath(import.meta.url))
assert(['development', 'production'].includes(mode))
assert(['source', 'installed'].includes(kind))
const pristine = JSON.parse(
  fs.readFileSync(path.join(here, 'cjs-recursive-binding-pristine.json'))
)
assert.equal(pristine.referenceVersion, '5.0.4')
const expected = pristine.forms[form]
assert(expected && form.endsWith(':binding-recursive'))
const load = createRequire(path.join(repo, 'package.json'))
if (kind === 'installed')
  for (const name of ['vitest', 'vite', '@vitest/mocker'])
    assert.throws(() => load.resolve(name))
fs.mkdirSync(output, { recursive: true })
const fixture = fs.mkdtempSync(
  path.join(repo, '.next-test-cjs-async-defaults-')
)
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
const body = fs.readFileSync(
  path.join(here, 'cjs-async-defaults-fixtures/contract.test.mjs.txt')
)
assert.equal(sha(body), pristine.authoredBodySHA256)
const sources = {
  'contract.test.mjs': body,
  'root.cjs': expected.root,
  'dependency.cjs': fs.readFileSync(
    path.join(here, 'cjs-async-defaults-fixtures/dependency.cjs.txt')
  ),
  'package.json': '{"private":true,"type":"module"}\n',
  'next.config.mjs':
    'export default ' + JSON.stringify({ turbopack: { root: repo } }) + '\n',
  'next.test.config.json':
    JSON.stringify({
      projects: [
        { name: 'cjs223', mode, environment: 'node', include: ['*.test.mjs'] },
      ],
      maxWorkers: 1,
    }) + '\n',
}
const pins = Object.fromEntries(
  Object.entries(sources).map(([name, bytes]) => [name, sha(bytes)])
)
fs.writeFileSync(
  path.join(output, 'SOURCE-PINS.json'),
  JSON.stringify(pins, null, 2) + '\n'
)
try {
  for (const [name, bytes] of Object.entries(sources))
    fs.writeFileSync(path.join(fixture, name), bytes)
  fs.symlinkSync(
    path.join(repo, 'node_modules'),
    path.join(fixture, 'node_modules'),
    'dir'
  )
  const reportPath = path.join(output, 'report.json')
  const env = {
    ...process.env,
    NODE_ENV: mode,
    NEXT_TELEMETRY_DISABLED: '1',
    TURBO_TASKS_AVAILABLE_PARALLELISM: '4',
    FORCE_COLOR: '0',
  }
  for (const name of [
    'CI',
    'NODE_OPTIONS',
    'NODE_PATH',
    'NEXT_TEST_NATIVE_DIR',
    'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
  ])
    delete env[name]
  const owner = await runOwnedNode(
    [
      load.resolve('next/dist/bin/next'),
      'test',
      fixture,
      '--run',
      '--reporter=json',
      '--outputFile=' + reportPath,
    ],
    {
      cwd: fixture,
      env,
      timeoutMs: 120000,
      auditDir: path.join(output, 'owners'),
    }
  )
  fs.writeFileSync(
    path.join(output, 'OWNER.json'),
    JSON.stringify(owner, null, 2) + '\n'
  )
  fs.writeFileSync(path.join(output, 'stdout.log'), owner.stdout)
  fs.writeFileSync(path.join(output, 'stderr.log'), owner.stderr)
  assertOwnedNodeCompleted(owner, 'CommonJS async object default ' + form)
  for (const [name, hash] of Object.entries(pins))
    assert.equal(sha(fs.readFileSync(path.join(fixture, name))), hash)
  const report = JSON.parse(fs.readFileSync(reportPath))
  const cases = report.testResults.flatMap((file) =>
    file.assertionResults.map((test) => ({
      name: test.fullName,
      status: test.status,
      failureMessages: test.failureMessages,
    }))
  )
  const rows = report.next.events
    .filter((event) => event.type === 'output')
    .flatMap((event) => event.text.split('\n'))
    .filter((text) => text.startsWith('CJS223:'))
    .map((text) => JSON.parse(text.slice(7)))
  assert.equal(owner.status, 0, owner.stderr)
  assert.equal(report.success, true)
  assert.deepEqual(cases, expected.cases)
  assert.deepEqual(
    report.testResults.map((file) => file.message),
    expected.fileMessages
  )
  assert.deepEqual(rows, expected.rows)
  const checks = {
    mode,
    form,
    completeAuthoredCasesAndRows: true,
    namespaceAndFunctionDescriptors: true,
    dependencyResetAndHeldValues: true,
    exactDefaultParameterScope: true,
    allAuthoredBytesHeld: true,
    allOwnersJoined: true,
    cases: cases.length,
    rows: rows.length,
  }
  fs.writeFileSync(
    path.join(output, 'CHECKS.json'),
    JSON.stringify(checks, null, 2) + '\n'
  )
  process.stdout.write(JSON.stringify(checks) + '\n')
} finally {
  fs.rmSync(fixture, { recursive: true, force: true })
}
