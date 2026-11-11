import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import {
  copyFileSync,
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
const [consumerArg, outputArg] = process.argv.slice(2)
assert(
  consumerArg && outputArg,
  'Usage: node verify-route-render.mjs <installed-consumer> <new-evidence-dir>'
)
const consumer = realpathSync(consumerArg),
  output = resolve(outputArg)
mkdirSync(output)
const directory = dirname(fileURLToPath(import.meta.url))
const expected = JSON.parse(
  readFileSync(join(directory, 'route-render.expected.json'), 'utf8')
)
const source = resolve(directory, '../next-testing-production-rsc-route')
const require = createRequire(join(consumer, 'package.json'))
const packagePath = realpathSync(require.resolve('next/package.json'))
const installed = relative(join(consumer, 'node_modules'), packagePath)
assert(
  !isAbsolute(installed) &&
    installed !== '..' &&
    !installed.startsWith('..' + sep),
  'Next must resolve from the physical consumer'
)
for (const name of ['vitest', 'vite'])
  assert.throws(() => require.resolve(name), name + ' must not be installed')
const fixture = join(consumer, '.next-test-route-render-' + randomUUID())
cpSync(source, fixture, { recursive: true })
writeFileSync(
  join(fixture, 'package.json'),
  '{"private":true,"type":"module"}\n'
)
const save = (name, value) =>
  writeFileSync(join(output, name), JSON.stringify(value, null, 2) + '\n')
const hash = (path) =>
  createHash('sha256').update(readFileSync(path)).digest('hex')
const sources = {}
function inventory(directory, prefix = '') {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const name = prefix + entry.name
    if (entry.isDirectory()) inventory(join(directory, entry.name), name + '/')
    else if (entry.isFile()) sources[name] = hash(join(directory, entry.name))
  }
}
inventory(source)
save('inputs.json', {
  runtime: process.version,
  next: JSON.parse(readFileSync(packagePath, 'utf8')).version,
  sources,
  reference: expected.reference,
})
const observations = []
try {
  for (const mode of ['development', 'production'])
    for (const kind of ['route-render', 'route-cancel']) {
      const name = mode + '-' + kind,
        path = join(output, name)
      mkdirSync(path)
      const configSource =
        kind === 'route-cancel'
          ? 'next.test.cancel.config.json'
          : 'next.test.config.json'
      copyFileSync(
        join(source, configSource),
        join(fixture, 'next.test.config.json')
      )
      const args = [
        require.resolve('next/dist/bin/next'),
        'test',
        fixture,
        '--run',
        '--project',
        name,
        '--reporter',
        'json',
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
        'NODE_OPTIONS',
        'NODE_PATH',
        'NEXT_TEST_NATIVE_DIR',
        'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
      ])
        delete env[key]
      const result = await runOwnedNode(args, {
        cwd: fixture,
        env,
        auditDir: join(path, 'processes'),
        timeoutMs: 150000,
      })
      writeFileSync(join(path, 'stdout.log'), result.stdout)
      writeFileSync(join(path, 'stderr.log'), result.stderr)
      assertOwnedNodeCompleted(result, name)
      assert.equal(result.status, kind === 'route-render' ? 0 : 1)
      const report = JSON.parse(readFileSync(join(path, 'report.json'), 'utf8'))
      const cases = report.testResults.flatMap((file) =>
        file.assertionResults.map(({ fullName, status, failureMessages }) => ({
          fullName,
          status,
          failureMessages,
        }))
      )
      const prefix =
        kind === 'route-render' ? 'ANCESTOR_ROUTE ' : 'ANCESTOR_CANCEL '
      const rows = report.next.events
        .filter((event) => event.type === 'output')
        .flatMap((event) => event.text.split('\n'))
        .filter((line) => line.startsWith(prefix))
        .map((line) => JSON.parse(line.slice(prefix.length)))
      if (kind === 'route-render') {
        assert.deepEqual(
          cases,
          expected.cases.map((fullName) => ({
            fullName,
            status: 'passed',
            failureMessages: [],
          }))
        )
        assert.deepEqual(rows, expected.rows)
      } else {
        assert.deepEqual(
          cases.map(({ fullName, status }) => ({ fullName, status })),
          expected.cancellationCases
        )
        assert.equal(cases[0].failureMessages.length, 1)
        assert.match(
          cases[0].failureMessages[0],
          /^Error: Test timed out in 500ms\.\nIf this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout"\./
        )
        assert.deepEqual(cases[1].failureMessages, [])
        assert.deepEqual(rows, [expected.cancellationRow])
      }
      for (const [name, digest] of Object.entries(sources))
        assert.equal(
          hash(join(fixture, name)),
          name === 'next.test.config.json' ? sources[configSource] : digest,
          'Source changed: ' + name
        )
      save(name + '-cases.json', cases)
      save(name + '-rows.json', rows)
      save(name + '-command.json', { args, status: result.status })
      observations.push({
        mode,
        kind,
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
  positiveCases: 8,
  cancellationCases: 4,
})
console.log(
  'Installed route render: 8 full HTML/Flight/status rows and 4 cancellation cases match; source and process cleanup held'
)
