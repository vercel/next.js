import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'

const [consumerArg, outputArg] = process.argv.slice(2)
assert(
  consumerArg && outputArg,
  'Usage: node verify.mjs <source-or-consumer-root> <new-evidence-dir>'
)
const consumer = realpathSync(consumerArg),
  output = resolve(outputArg)
mkdirSync(output)
const directory = dirname(fileURLToPath(import.meta.url))
const expected = JSON.parse(
  readFileSync(join(directory, 'reference.json'), 'utf8')
)
const input = join(directory, 'cases')
const sha = (value) => createHash('sha256').update(value).digest('hex')
const authored = {}
for (const name of readdirSync(input).sort()) {
  const value = readFileSync(join(input, name))
  assert.equal(sha(value), expected.inputs[name])
  authored[name.slice(0, -4)] = value
}
assert.equal(Object.keys(authored).length, 8)
const require = createRequire(join(consumer, 'package.json'))
const next = require.resolve('next/dist/bin/next')
const save = (dir, name, value) =>
  writeFileSync(join(dir, name), JSON.stringify(value, null, 2) + '\n')
save(output, 'inputs.json', {
  runtime: process.version,
  executable: realpathSync(process.execPath),
  next: realpathSync(next),
  fixtureSHA256: expected.inputs,
  reference: expected.reference,
})
const env = { ...process.env, NEXT_TELEMETRY_DISABLED: '1', FORCE_COLOR: '0' }
for (const key of [
  'CI',
  'NODE_OPTIONS',
  'NODE_PATH',
  'NEXT_TEST_NATIVE_DIR',
  'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
])
  delete env[key]
const profiles = []
for (const mode of ['development', 'production']) {
  const evidence = join(output, mode)
  mkdirSync(evidence)
  const fixture = join(consumer, '.next-test-fixture-numeric-' + randomUUID())
  mkdirSync(fixture)
  mkdirSync(join(fixture, 'cases'))
  for (const [name, value] of Object.entries(authored))
    writeFileSync(join(fixture, 'cases', name), value)
  symlinkSync(
    join(consumer, 'node_modules'),
    join(fixture, 'node_modules'),
    'dir'
  )
  writeFileSync(
    join(fixture, 'package.json'),
    '{"private":true,"type":"module"}\n'
  )
  writeFileSync(
    join(fixture, 'next.config.mjs'),
    'export default ' + JSON.stringify({ turbopack: { root: consumer } }) + '\n'
  )
  const test = {
    mode,
    environment: 'node',
    include: ['cases/*.test.mjs'],
    provide: { value: 0 },
    maxWorkers: 1,
    fileParallelism: false,
    cache: false,
    testTimeout: 5000,
    hookTimeout: 5000,
  }
  writeFileSync(
    join(fixture, 'vitest.config.mjs'),
    'export default ' + JSON.stringify({ test }) + '\n'
  )
  const trace = join(evidence, 'rows.jsonl')
  writeFileSync(trace, '')
  writeFileSync(
    join(fixture, 'reporter.mjs'),
    `import{appendFileSync}from'node:fs'\nexport default class{onUserConsoleLog(log){for(const line of log.content.split('\\n'))if(line.startsWith('FIXTURE_DEPENDENCY_ROW '))appendFileSync(${JSON.stringify(trace)},line.slice(23)+'\\n')}}\n`
  )
  let joined = false
  try {
    const args = [
      next,
      'test',
      fixture,
      '--run',
      '--reporter=json',
      '--reporter=' + join(fixture, 'reporter.mjs'),
      '--outputFile=' + join(evidence, 'report.json'),
    ]
    save(evidence, 'authored.json', {
      args,
      test,
      fixtureSHA256: expected.inputs,
      bounds: { cli: 180000, test: 5000, hook: 5000 },
    })
    const result = await runOwnedNode(args, {
      cwd: fixture,
      env: { ...env, NODE_ENV: mode },
      auditDir: join(evidence, 'owners'),
      timeoutMs: 180000,
    })
    save(evidence, 'result.json', result)
    writeFileSync(join(evidence, 'stdout.log'), result.stdout)
    writeFileSync(join(evidence, 'stderr.log'), result.stderr)
    assertOwnedNodeCompleted(result, mode + ' fixture overloads')
    joined = true
    assert.equal(
      result.status,
      0,
      `Numeric fixture runtime failed; see ${evidence}`
    )
    const report = JSON.parse(
      readFileSync(join(evidence, 'report.json'), 'utf8')
    )
    const actual = {
      rows: readFileSync(trace, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line))
        .sort((a, b) => a.contract.localeCompare(b.contract)),
      cases: report.testResults
        .flatMap((file) =>
          file.assertionResults.map((test) => ({
            name: test.fullName,
            state: test.status,
            failureMessages: test.failureMessages,
          }))
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
      summary: Object.fromEntries(
        Object.entries(report).filter(
          ([key]) => key.startsWith('num') || key === 'success'
        )
      ),
    }
    save(evidence, 'actual-model.json', actual)
    assert.deepEqual(
      actual,
      expected.model,
      'Complete per-contract author rows, cases, and counts must match genuine; cross-file scheduling is not asserted.'
    )
    profiles.push({
      mode,
      cases: actual.cases.length,
      wholeAuthorRows: actual.rows.length,
      completeGenuinePerContractModelExact: true,
      allOwnersJoined: true,
    })
  } finally {
    if (joined) rmSync(fixture, { recursive: true, force: true })
    save(evidence, 'closure.json', {
      allOwnersJoined: joined,
      fixtureAbsent: !existsSync(fixture),
    })
  }
}
save(output, 'VERIFIED.json', {
  profiles: profiles.length,
  runs: profiles,
  cases: profiles.reduce((sum, row) => sum + row.cases, 0),
  wholeAuthorRows: profiles.reduce((sum, row) => sum + row.wholeAuthorRows, 0),
  completePerContractGenuineModelsExact: true,
  noCrossFileSchedulingClaimed: true,
  allOwnersJoined: true,
  allInputsRemovedAfterOwnedReadersJoined: true,
  rawReportsRetained: true,
})
