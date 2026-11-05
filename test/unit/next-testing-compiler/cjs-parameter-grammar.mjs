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
import { resolveFixturePath } from '../../lib/next-testing-fixtures.cjs'

const [repoArg, outputArg, mode, kind] = process.argv.slice(2)
const repo = fs.realpathSync(repoArg)
const output = path.resolve(outputArg)
const here = path.dirname(fileURLToPath(import.meta.url))
assert(['development', 'production'].includes(mode))
assert(['source', 'installed'].includes(kind))
const expected = JSON.parse(
  fs.readFileSync(
    resolveFixturePath(path.join(here, 'cjs-parameter-grammar-pristine.json'))
  )
)
assert.equal(expected.referenceVersion, '5.0.4')
const load = createRequire(path.join(repo, 'package.json'))
if (kind === 'installed') {
  for (const name of ['vitest', 'vite', '@vitest/mocker']) {
    assert.throws(() => load.resolve(name))
  }
}
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
fs.mkdirSync(output, { recursive: true })
const fixture = fs.mkdtempSync(path.join(repo, '.next-test-cjs-grammar-'))
try {
  for (const [name, hash] of Object.entries(expected.authoredSHA256)) {
    const bytes = fs.readFileSync(
      resolveFixturePath(
        path.join(here, 'cjs-parameter-grammar-fixtures', name + '.txt')
      )
    )
    assert.equal(sha(bytes), hash, name)
    fs.writeFileSync(path.join(fixture, name), bytes)
  }
  fs.writeFileSync(
    path.join(fixture, 'package.json'),
    '{"private":true,"type":"module"}\n'
  )
  fs.writeFileSync(
    path.join(fixture, 'next.config.mjs'),
    'export default ' + JSON.stringify({ turbopack: { root: repo } }) + '\n'
  )
  fs.writeFileSync(
    path.join(fixture, 'next.test.config.json'),
    JSON.stringify({
      maxWorkers: 1,
      projects: [
        {
          name: 'cjs-grammar291',
          mode,
          environment: 'node',
          include: ['contract.test.mjs'],
        },
      ],
    }) + '\n'
  )
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
  assertOwnedNodeCompleted(owner, 'CommonJS recursive parameter grammar')
  for (const [name, hash] of Object.entries(expected.authoredSHA256)) {
    assert.equal(sha(fs.readFileSync(path.join(fixture, name))), hash, name)
  }
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
    .filter((line) => line.startsWith('CJS291:'))
    .map((line) => JSON.parse(line.slice(7)))
  fs.writeFileSync(
    path.join(output, 'OBSERVED.json'),
    JSON.stringify({ cases, rows }, null, 2) + '\n'
  )
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
    runtime: process.version,
    forms: expected.forms,
    cases: cases.length,
    rows: rows.length,
    completeAuthoredCasesAndRows: true,
    namespaceAndFunctionDescriptors: true,
    dependencyResetAndHeldValues: true,
    exactParameterEvaluation: true,
    allAuthoredBytesHeld: true,
    allOwnersJoined: true,
  }
  fs.writeFileSync(
    path.join(output, 'CHECKS.json'),
    JSON.stringify(checks, null, 2) + '\n'
  )
  process.stdout.write(JSON.stringify(checks) + '\n')
} finally {
  fs.rmSync(fixture, { recursive: true, force: true })
}
