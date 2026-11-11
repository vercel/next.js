import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from './process-supervisor.mjs'

const [consumerArgument, outputArgument] = process.argv.slice(2)
assert(consumerArgument && outputArgument, 'consumer and output required')
const consumer = realpathSync(consumerArgument)
const output = resolve(outputArgument)
const directory = dirname(fileURLToPath(import.meta.url))
const source = resolve(directory, '../next-testing-production-rsc-route')
const expected = JSON.parse(
  readFileSync(join(source, 'route-parallel-default.expected.json'), 'utf8')
)
const require = createRequire(join(consumer, 'package.json'))
const installed = relative(
  join(consumer, 'node_modules'),
  realpathSync(require.resolve('next/package.json'))
)
assert(
  !isAbsolute(installed) &&
    installed !== '..' &&
    !installed.startsWith('..' + sep)
)
for (const name of ['vitest', 'vite'])
  assert.throws(() => require.resolve(name))
mkdirSync(output)
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
save('inputs.json', { consumer, runtime: process.version, sources })
const observations = []
const fixture = join(consumer, '.next-test-parallel-default-' + randomUUID())
cpSync(source, fixture, { recursive: true })
writeFileSync(
  join(fixture, 'package.json'),
  '{"private":true,"type":"module"}\n'
)
try {
  for (const mode of ['development', 'production']) {
    for (const suffix of ['root', 'nested']) {
      const path = join(output, mode + '-' + suffix)
      mkdirSync(path)
      const args = [
        require.resolve('next/dist/bin/next'),
        'test',
        fixture,
        '--run',
        '--project',
        mode + '-parallel-default-' + suffix,
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
      save(mode + '-' + suffix + '-command.json', { args })
      const result = await runOwnedNode(args, {
        cwd: fixture,
        env,
        auditDir: join(path, 'processes'),
        timeoutMs: 120000,
      })
      writeFileSync(join(path, 'stdout.log'), result.stdout)
      writeFileSync(join(path, 'stderr.log'), result.stderr)
      assertOwnedNodeCompleted(result, mode + ' parallel defaults ' + suffix)
      const report = JSON.parse(readFileSync(join(path, 'report.json'), 'utf8'))
      const cases = report.testResults.flatMap((file) =>
        file.assertionResults.map(({ fullName, status, failureMessages }) => ({
          fullName,
          status,
          failureMessages,
        }))
      )
      const routePath = suffix === 'root' ? '/acme/panel' : '/acme/panel/report'
      assert.equal(result.status, 0)
      assert.deepEqual(
        cases,
        ['html', 'flight'].map((format) => ({
          fullName: `renders real default slots on ${routePath} as ${format}`,
          status: 'passed',
          failureMessages: [],
        }))
      )
      const rows = report.next.events
        .filter((event) => event.type === 'output')
        .flatMap((event) => event.text.split('\n'))
        .filter((line) => line.startsWith('PARALLEL_ROUTE '))
        .map((line) => JSON.parse(line.slice('PARALLEL_ROUTE '.length)))
      assert.deepEqual(
        rows,
        expected.filter((row) => row.path === routePath)
      )
      for (const [name, digest] of Object.entries(sources))
        assert.equal(
          hash(join(fixture, name)),
          digest,
          'Source changed: ' + name
        )
      save(mode + '-' + suffix + '-cases.json', cases)
      save(mode + '-' + suffix + '-rows.json', rows)
      observations.push({
        mode,
        suffix,
        status: result.status,
        fullCases: cases.length,
        fullRows: rows.length,
      })
    }
  }
} finally {
  rmSync(fixture, { recursive: true, force: true })
}
assert(!existsSync(fixture))
save('verification.json', {
  observations,
  sourceHashesHeld: true,
  fixtureRemoved: true,
  fullCases: 8,
  fullRows: 8,
})
console.log(
  'Installed parallel defaults: 8 complete normal-app rows; source and cleanup held'
)
