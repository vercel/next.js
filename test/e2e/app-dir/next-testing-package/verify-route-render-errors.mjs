import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import {
  copyFileSync,
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
assert(consumerArgument && outputArgument, 'consumer and new output required')
const consumer = realpathSync(consumerArgument)
const output = resolve(outputArgument)
mkdirSync(output)
const directory = dirname(fileURLToPath(import.meta.url))
const corpus = join(directory, 'fixtures/route-render-errors')
const base = join(directory, 'fixtures/late-streamed-redirect')
const require = createRequire(join(consumer, 'package.json'))
const next = require.resolve('next/dist/bin/next')
const installedNext = relative(
  join(consumer, 'node_modules'),
  realpathSync(next)
)
assert(
  !isAbsolute(installedNext) &&
    installedNext !== '..' &&
    !installedNext.startsWith('..' + sep)
)
for (const name of ['vitest', 'vite'])
  assert.throws(() => require.resolve(name))
const hash = (file) =>
  createHash('sha256').update(readFileSync(file)).digest('hex')
const save = (dir, name, value) =>
  writeFileSync(join(dir, name), JSON.stringify(value, null, 2) + '\n')
const baseFiles = JSON.parse(
  readFileSync(join(corpus, 'base-files.json'), 'utf8')
)
const sourceManifest = JSON.parse(
  readFileSync(join(corpus, 'sources.json'), 'utf8')
)
for (const { path, sha256 } of sourceManifest)
  assert.equal(hash(join(corpus, path)), sha256)
const verification = []
for (const [phase, mode, flag] of [
  ['default-development', 'development', 'default'],
  ['default-production', 'production', 'default'],
  ['true-development', 'development', 'true'],
  ['false-development', 'development', 'false'],
]) {
  const expectedName = flag === 'default' ? mode : flag + '-' + mode
  const expected = JSON.parse(
    readFileSync(join(corpus, expectedName + '.expected.json'), 'utf8')
  )
  assert.equal(expected.length, 4)
  for (const api of ['buffered', 'streaming'])
    for (const scope of ['root', 'nested']) {
      const name = api + '-' + scope
      const out = join(output, phase, name)
      mkdirSync(out, { recursive: true })
      const fixture = join(consumer, '.next-test-route-error-' + randomUUID())
      mkdirSync(fixture)
      const inputs = {}
      const stage = (from, to) => {
        const target = join(fixture, to)
        mkdirSync(dirname(target), { recursive: true })
        copyFileSync(from, target)
        inputs[to] = hash(target)
      }
      for (const { path, sha256 } of baseFiles) {
        assert.equal(hash(join(base, path + '.txt')), sha256)
        stage(join(base, path + '.txt'), path)
      }
      function stageApp(path, prefix = '') {
        for (const entry of readdirSync(path, { withFileTypes: true })) {
          const source = join(path, entry.name)
          if (entry.isDirectory()) stageApp(source, prefix + entry.name + '/')
          else stage(source, 'app/' + prefix + entry.name.slice(0, -4))
        }
      }
      stageApp(join(corpus, 'app'))
      stage(join(corpus, 'next.config-' + flag + '.ts.txt'), 'next.config.ts')
      stage(join(corpus, 'body-row.mjs'), 'body-row.mjs')
      stage(join(corpus, 'error-proof.mjs'), 'error-proof.mjs')
      stage(join(corpus, expectedName + '.expected.json'), 'expected.json')
      writeFileSync(
        join(fixture, 'package.json'),
        '{"private":true,"type":"module"}\n'
      )
      const file = name + '.case.jsx'
      writeFileSync(
        join(fixture, file),
        'const api=' +
          JSON.stringify(api) +
          '\nconst scope=' +
          JSON.stringify(scope) +
          '\n' +
          readFileSync(join(corpus, 'cases.jsx.txt'), 'utf8')
      )
      inputs[file] = hash(join(fixture, file))
      const project = {
        name,
        environment: 'rsc',
        mode,
        route:
          '/[tenant]/render-error/' +
          (scope === 'nested' ? 'nested/' : '') +
          '[...slug]',
        include: [file],
        fileTimeout: 60000,
      }
      writeFileSync(
        join(fixture, 'next.test.config.json'),
        JSON.stringify({ maxWorkers: 1, projects: [project] }) + '\n'
      )
      const env = {
        ...process.env,
        NODE_ENV: mode,
        NEXT_TELEMETRY_DISABLED: '1',
        FORCE_COLOR: '0',
      }
      for (const key of [
        'CI',
        'NODE_OPTIONS',
        'NODE_PATH',
        'NEXT_TEST_NATIVE_DIR',
        'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
      ])
        delete env[key]
      const args = [
        next,
        'test',
        fixture,
        '--run',
        '--reporter=json',
        '--outputFile',
        join(out, 'report.json'),
      ]
      save(out, 'inputs.json', {
        mode,
        flag,
        api,
        scope,
        project,
        args,
        sources: inputs,
        runtime: process.version,
      })
      let closed = false
      try {
        const result = await runOwnedNode(args, {
          cwd: fixture,
          env,
          auditDir: join(out, 'processes'),
          timeoutMs: 120000,
        })
        writeFileSync(join(out, 'stdout.log'), result.stdout)
        writeFileSync(join(out, 'stderr.log'), result.stderr)
        assertOwnedNodeCompleted(result, 'actual AppPage render errors')
        closed = true
        const report = JSON.parse(
          readFileSync(join(out, 'report.json'), 'utf8')
        )
        const cases = report.testResults.flatMap((file) =>
          file.assertionResults.map(
            ({ fullName, status, failureMessages }) => ({
              fullName,
              status,
              failureMessages,
            })
          )
        )
        const lines = report.next.events
          .filter((event) => event.type === 'output')
          .flatMap((event) => event.text.split('\n'))
        const facts = {}
        for (const [prefix, target] of [
          ['ROUTE_RENDER_ERROR_ROW ', 'rows'],
          ['ROUTE_RENDER_ERROR_RAW ', 'raw'],
          ['ROUTE_RENDER_ERROR_MANIFESTS ', 'client-manifests'],
          ['ROUTE_RENDER_ERROR_SEMANTIC ', 'semantic-rows'],
        ]) {
          facts[target] = lines
            .filter((line) => line.startsWith(prefix))
            .map((line) => JSON.parse(line.slice(prefix.length)))
          save(out, target + '.json', facts[target])
        }
        save(out, 'cases.json', cases)
        assert.equal(result.status, 0)
        assert.deepEqual(
          cases,
          ['html', 'flight'].map((format) => ({
            fullName: `${api} ${scope} actual AppPage render error ${format}`,
            status: 'passed',
            failureMessages: [],
          }))
        )
        assert.equal(facts.rows.length, 2)
        assert.deepEqual(
          facts['semantic-rows'],
          expected
            .filter((row) => row.scope === scope)
            .map((row) => ({ api, row }))
        )
        assert.equal(facts.raw.length, 2)
        assert.equal(facts['client-manifests'].length, 2)
        assert.equal(report.numTotalTests, 2)
        assert.equal(report.numPassedTests, 2)
        assert.deepEqual(
          report.next.events
            .filter((event) => event.type === 'file-start')
            .map((event) => event.entry.profile),
          [
            {
              id: name,
              environment: 'rsc',
              mode,
              runtime: 'nodejs',
              bundler: 'turbopack',
              route: project.route,
            },
          ]
        )
        verification.push({
          phase,
          mode,
          flag,
          api,
          scope,
          cases: 2,
          fullRows: 2,
          allFieldsMatch: true,
        })
      } finally {
        for (const [file, sha256] of Object.entries(inputs))
          assert.equal(hash(join(fixture, file)), sha256)
        save(out, 'source-hold.json', {
          allInputHashesHeld: true,
          paths: Object.keys(inputs).length,
        })
        if (closed) rmSync(fixture, { recursive: true })
        save(out, 'closed.json', {
          ownedProcessesClosed: closed,
          fixtureRemoved: closed,
        })
      }
    }
}
for (const { path, sha256 } of sourceManifest)
  assert.equal(hash(join(corpus, path)), sha256)
save(output, 'verified.json', verification)
assert.equal(
  verification.reduce((sum, row) => sum + row.fullRows, 0),
  32
)
console.log(
  'Installed actual AppPage root/nested errors:32 full rows across default dev/prod and explicit true/false match normal applications'
)
