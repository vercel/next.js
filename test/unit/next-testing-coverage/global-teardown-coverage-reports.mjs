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
assert(rootArg && outputArg && profile)
const root = resolve(rootArg)
const output = resolve(outputArg)
const here = dirname(fileURLToPath(import.meta.url))
const pristine = JSON.parse(
  readFileSync(
    join(here, 'fixtures/istanbul-provider/global-teardown-pristine.json')
  )
)
const row = pristine.rows.find((row) => row.profile === profile)
assert(row, 'Unknown global teardown coverage profile')
const source = process.argv.includes('--source')
const load = createRequire(join(root, 'package.json'))
if (!source)
  for (const name of ['vitest', 'vite', '@vitest/mocker'])
    assert.throws(() => load.resolve(name))
const fixture = mkdtempSync(join(root, '.next-global-coverage-'))
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
mkdirSync(output, { recursive: true })
let joined = false
try {
  const files = {
    ...row.files,
    'next.test.config.mjs': row.files['vitest.config.mjs'].replace(
      "name:'global-map214',",
      "name:'global-map214',mode:'" + row.mode + "',"
    ),
    'next.config.mjs':
      'export default ' + JSON.stringify({ turbopack: { root } }) + '\n',
  }
  const pins = {}
  for (const [name, bytes] of Object.entries(files)) {
    if (Object.hasOwn(row.sourceSHA256, name))
      assert.equal(sha(bytes), row.sourceSHA256[name])
    writeFileSync(join(fixture, name), bytes)
    pins[name] = sha(bytes)
  }
  if (row.name === 'report-and-teardown-error')
    mkdirSync(join(fixture, 'coverage/coverage-final.json'), {
      recursive: true,
    })
  if (row.name === 'json-and-teardown-error')
    mkdirSync(join(fixture, 'cases.json'))
  const env = {
    ...process.env,
    NODE_ENV: row.mode,
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
  assertOwnedNodeCompleted(owner, 'Actual global teardown coverage ' + profile)
  joined = true
  let report
  try {
    report = JSON.parse(readFileSync(join(fixture, 'cases.json'), 'utf8'))
  } catch {}
  if (report) {
    writeFileSync(
      join(output, 'cases.json'),
      JSON.stringify(report, null, 2) + '\n'
    )
    for (const event of report.next.events)
      if (event.type === 'file-start')
        assert.equal(event.entry.profile.mode, row.mode)
  }
  const trace = readFileSync(join(fixture, 'trace.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(JSON.parse)
  let coverage
  try {
    coverage = JSON.parse(
      readFileSync(join(fixture, 'coverage/coverage-final.json'), 'utf8')
    )
  } catch {}
  if (coverage)
    writeFileSync(
      join(output, 'coverage-final.json'),
      JSON.stringify(coverage, null, 2) + '\n'
    )
  const observations = {
    status: owner.status,
    trace,
    json: !!report,
    coverageMap: !!report && Object.hasOwn(report, 'coverageMap'),
    coverage: !!coverage,
    tests: report?.numTotalTests ?? null,
    success: report?.success ?? null,
  }
  assert.deepEqual(observations, row.observations)
  if (report) {
    const standard = structuredClone(report)
    delete standard.next
    delete standard.startTime
    for (const file of standard.testResults) {
      delete file.startTime
      delete file.endTime
      delete file.duration
      for (const test of file.assertionResults) delete test.duration
    }
    assert.deepEqual(
      JSON.parse(
        JSON.stringify(standard).replaceAll(fixture, '<PROJECT_ROOT>')
      ),
      row.report
    )
  }
  if (row.name !== 'normal')
    assert(owner.stderr.includes('owned settled global teardown error'))
  for (const [name, pin] of Object.entries(pins))
    assert.equal(sha(readFileSync(join(fixture, name))), pin)
  writeFileSync(
    join(output, 'CHECKS.json'),
    JSON.stringify(
      {
        profile,
        actualCompiledMode: row.mode,
        genuineObservationsAndPublicationOrder: true,
        wholeJSONWithCompleteMap: true,
        actualAuthoredTeardownErrorRetained: row.name !== 'normal',
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
