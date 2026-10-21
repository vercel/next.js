import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  copyFileSync,
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

const [consumerArgument, outputArgument, modeArgument] = process.argv.slice(2)
assert(consumerArgument && outputArgument, 'consumer and output required')
assert(
  modeArgument === undefined ||
    ['development', 'production'].includes(modeArgument),
  'invalid compilation mode'
)
const modes =
  modeArgument === undefined ? ['development', 'production'] : [modeArgument]
const consumer = resolve(consumerArgument)
const output = resolve(outputArgument)
const directory = dirname(fileURLToPath(import.meta.url))
const source = join(directory, 'fixtures/route-render-auth')
const fixture = join(consumer, '.next-test-route-render-auth-' + randomUUID())
const require = createRequire(join(consumer, 'package.json'))
for (const dependency of ['vitest', 'vite'])
  assert(!existsSync(join(consumer, 'node_modules', dependency)))
mkdirSync(output)
mkdirSync(fixture)
const hash = (path) =>
  createHash('sha256').update(readFileSync(path)).digest('hex')
const sources = {}
const staged = {}
function stage(path, prefix = '') {
  for (const file of readdirSync(path, { withFileTypes: true })) {
    const name = prefix + file.name
    if (file.isDirectory()) stage(join(path, file.name), name + '/')
    else if (file.isFile()) {
      const target = name.endsWith('.txt') ? name.slice(0, -4) : name
      sources[name] = hash(join(path, file.name))
      staged[target] = sources[name]
      mkdirSync(dirname(join(fixture, target)), { recursive: true })
      copyFileSync(join(path, file.name), join(fixture, target))
    }
  }
}
stage(source)
writeFileSync(
  join(fixture, 'package.json'),
  '{"private":true,"type":"module"}\n'
)
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
  for (const mode of modes) {
    const path = join(output, mode)
    mkdirSync(path)
    const expected = JSON.parse(
      readFileSync(join(source, 'expected-' + mode + '.json'), 'utf8')
    )
    copyFileSync(
      join(fixture, 'expected-' + mode + '.json'),
      join(fixture, 'expected.json')
    )
    writeFileSync(
      join(fixture, 'next.test.config.json'),
      JSON.stringify({
        maxWorkers: 1,
        projects: [
          {
            name: 'auth-route-' + mode,
            environment: 'rsc',
            mode,
            route: '/[tenant]/access/[...slug]',
            include: ['auth-route.case.jsx'],
            fileTimeout: 60000,
          },
        ],
      }) + '\n'
    )
    const args = [
      require.resolve('next/dist/bin/next'),
      'test',
      fixture,
      '--run',
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
    assertOwnedNodeCompleted(result, 'full route HTTP-access fallback ' + mode)
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
      .filter((line) => line.startsWith('FULL_ROUTE_AUTH '))
      .map((line) => JSON.parse(line.slice('FULL_ROUTE_AUTH '.length)))
    writeFileSync(
      join(path, 'cases.json'),
      JSON.stringify(cases, null, 2) + '\n'
    )
    writeFileSync(join(path, 'rows.json'), JSON.stringify(rows, null, 2) + '\n')
    writeFileSync(
      join(path, 'exit.json'),
      JSON.stringify(
        {
          status: result.status,
          cases: cases.length,
          passed: cases.filter((value) => value.status === 'passed').length,
          fullRows: rows.length,
        },
        null,
        2
      ) + '\n'
    )
    assert.equal(result.status, 0)
    assert.equal(cases.length, 8)
    assert(cases.every((value) => value.status === 'passed'))
    assert.deepEqual(rows, expected)
    assert.equal(
      hash(join(fixture, 'expected.json')),
      sources['expected-' + mode + '.json']
    )
    observations.push({
      mode,
      cases: cases.length,
      fullRows: rows.length,
      exactReferenceMatch: true,
    })
  }
} finally {
  for (const [name, digest] of Object.entries(sources))
    assert.equal(
      hash(join(source, name)),
      digest,
      'Reference fixture changed: ' + name
    )
  for (const [name, digest] of Object.entries(staged))
    assert.equal(
      hash(join(fixture, name)),
      digest,
      'Authored test source changed: ' + name
    )
  rmSync(fixture, { recursive: true, force: true })
  save('verification.json', {
    observations,
    sourceHashesHeld: true,
    stagedBodyBytesHeld: true,
    fixtureRemoved: true,
  })
}
console.log(
  JSON.stringify({ observations, sourceHashesHeld: true, fixtureRemoved: true })
)
