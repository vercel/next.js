import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'
const [consumerArg, outputArg, policy] = process.argv.slice(2),
  consumer = resolve(consumerArg),
  output = resolve(outputArg),
  load = createRequire(join(consumer, 'package.json'))
assert(['watch', 'shared', 'realm', 'mixed-mode'].includes(policy))
fs.mkdirSync(output, { recursive: true })
const row = JSON.parse(
    fs.readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        'fixtures/threshold-formatter-multiproject-pristine.json'
      )
    )
  ).rows.find((row) => row.name === 'development-root-two'),
  fixture = fs.mkdtempSync(join(consumer, '.next-root-formatter-refusal-')),
  sha = (value) => createHash('sha256').update(value).digest('hex')
const begin = row.configTemplate.indexOf('projects: ') + 10,
  end = row.configTemplate.indexOf(', maxWorkers: '),
  projects = JSON.parse(row.configTemplate.slice(begin, end))
if (policy === 'shared')
  for (const project of projects) project.test.isolate = false
if (policy === 'realm')
  for (const project of projects) project.test.environment = 'jsdom'
if (policy === 'mixed-mode') projects[1].test.mode = 'production'
const config = (
  row.configTemplate.slice(0, begin) +
  JSON.stringify(projects) +
  row.configTemplate.slice(end)
).replaceAll('<OUTPUT_DIR>', output)
let joined = false
try {
  for (const [name, value] of Object.entries(row.sourceFiles))
    fs.writeFileSync(join(fixture, name), value.source)
  fs.writeFileSync(join(fixture, 'package.json'), ' {"type":"module"}\n')
  fs.writeFileSync(join(fixture, 'vitest.config.mjs'), config)
  fs.writeFileSync(
    join(fixture, 'next.config.mjs'),
    'export default ' + JSON.stringify({ turbopack: { root: consumer } }) + '\n'
  )
  fs.mkdirSync(join(fixture, '__snapshots__'))
  fs.writeFileSync(join(output, 'before.mjs'), config)
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
      policy === 'watch' ? '--watch' : '--run',
      '--reporter=json',
      '--outputFile=' + join(output, 'cases.json'),
    ],
    { cwd: fixture, env, auditDir: join(output, 'owners'), timeoutMs: 120000 }
  )
  fs.writeFileSync(
    join(output, 'owner.json'),
    JSON.stringify(owner, null, 2) + '\n'
  )
  fs.writeFileSync(join(output, 'stdout.log'), owner.stdout)
  fs.writeFileSync(join(output, 'stderr.log'), owner.stderr)
  assertOwnedNodeCompleted(
    owner,
    'retained root formatter CLI refusal ' + policy
  )
  joined = true
  assert.equal(owner.status, 1, owner.stderr)
  assert.match(
    owner.stderr,
    /Coverage threshold autoUpdate currently requires one one-shot project\./
  )
  assert(!fs.existsSync(join(output, 'cases.json')))
  assert(!fs.existsSync(join(fixture, 'coverage')))
  assert(!fs.existsSync(join(output, 'trace.jsonl')))
  assert.equal(
    fs.readFileSync(join(fixture, 'vitest.config.mjs'), 'utf8'),
    config
  )
  for (const [name, value] of Object.entries(row.sourceFiles))
    assert.equal(sha(fs.readFileSync(join(fixture, name))), value.sha256)
  assert.deepEqual(fs.readdirSync(join(fixture, '__snapshots__')), [])
  fs.writeFileSync(
    join(output, 'CHECKS.json'),
    JSON.stringify(
      {
        policy,
        node: process.version,
        originalDiagnosticRetained: true,
        zeroCallbacksNoReportsNoConfigEdit: true,
        allActualOwnersJoined: true,
      },
      null,
      2
    ) + '\n'
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
