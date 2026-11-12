import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from './process-supervisor.mjs'

const [consumerArgument, outputArgument] = process.argv.slice(2)
assert(consumerArgument && outputArgument, 'consumer and output required')
const consumer = resolve(consumerArgument)
const output = resolve(outputArgument)
const directory = dirname(fileURLToPath(import.meta.url))
const source = resolve(directory, '../next-testing-production-rsc-route')
const expected = JSON.parse(
  readFileSync(join(source, 'route-render-encoded.expected.json'), 'utf8')
)
const fixture = join(
  consumer,
  '.next-test-route-render-encoded-' + randomUUID()
)
const require = createRequire(join(consumer, 'package.json'))
for (const dependency of ['vitest', 'vite'])
  assert(!existsSync(join(consumer, 'node_modules', dependency)))
mkdirSync(output)
cpSync(source, fixture, { recursive: true })
writeFileSync(
  join(fixture, 'package.json'),
  '{"private":true,"type":"module"}\n'
)
const hash = (file) =>
  createHash('sha256').update(readFileSync(file)).digest('hex')
const sources = {}
function inventory(path, prefix = '') {
  for (const file of readdirSync(path, { withFileTypes: true })) {
    const name = prefix + file.name
    if (file.isDirectory()) inventory(join(path, file.name), name + '/')
    else if (file.isFile()) sources[name] = hash(join(path, file.name))
  }
}
inventory(source)
const save = (name, value) =>
  writeFileSync(join(output, name), JSON.stringify(value, null, 2) + '\n')
save('inputs.json', {
  consumer,
  fixture,
  runtime: process.version,
  sources,
  noVitestOrVite: true,
})
const observations = []
try {
  for (const mode of ['development', 'production']) {
    const path = join(output, mode)
    mkdirSync(path)
    const args = [
      require.resolve('next/dist/bin/next'),
      'test',
      fixture,
      '--run',
      '--project',
      `${mode}-route-render-encoded`,
      '--reporter=json',
      '--outputFile',
      join(path, 'report.json'),
    ]
    const env = {
      ...process.env,
      NODE_ENV: mode,
      NEXT_TELEMETRY_DISABLED: '1',
      FORCE_COLOR: '0',
    }
    for (const key of [
      'CI',
      'NODE_PATH',
      'NODE_OPTIONS',
      'NEXT_TEST_NATIVE_DIR',
      'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
    ])
      delete env[key]
    save(mode + '-command.json', { args })
    const result = await runOwnedNode(args, {
      cwd: fixture,
      env,
      auditDir: join(path, 'processes'),
      timeoutMs: 120000,
    })
    writeFileSync(join(path, 'stdout.log'), result.stdout)
    writeFileSync(join(path, 'stderr.log'), result.stderr)
    assertOwnedNodeCompleted(result, 'encoded full route ' + mode)
    const report = JSON.parse(readFileSync(join(path, 'report.json'), 'utf8'))
    const cases = report.testResults.flatMap((file) =>
      file.assertionResults.map(({ fullName, status, failureMessages }) => ({
        fullName,
        status,
        failureMessages,
      }))
    )
    const rows = report.next.events
      .filter((event) => event.type === 'output')
      .flatMap((event) => event.text.split('\n'))
      .filter((line) => line.startsWith('FULL_ROUTE_ENCODED '))
      .map((line) => JSON.parse(line.slice('FULL_ROUTE_ENCODED '.length)))
    writeFileSync(
      join(path, 'cases.json'),
      JSON.stringify(cases, null, 2) + '\n'
    )
    writeFileSync(join(path, 'rows.json'), JSON.stringify(rows, null, 2) + '\n')
    assert.equal(result.status, 0)
    assert.deepEqual(cases, expected.cases)
    assert.deepEqual(rows, expected.rows)
    for (const [name, digest] of Object.entries(sources))
      assert.equal(hash(join(fixture, name)), digest, 'Source changed: ' + name)
    observations.push({
      mode,
      status: result.status,
      fullCases: cases.length,
      fullRows: rows.length,
      exactReferenceMatch: true,
    })
  }
} finally {
  rmSync(fixture, { recursive: true, force: true })
}
assert(!existsSync(fixture))
save('verification.json', {
  observations,
  sourceHashesHeld: true,
  fixtureRemoved: true,
  fullCases: 20,
  fullRows: 20,
})
console.log(
  'Installed encoded route render: 20 complete HTML/Flight request/ancestor/after rows match ordinary Next; source and cleanup held'
)
