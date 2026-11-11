import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from './process-supervisor.mjs'
import { routeModel } from './route-regression-models.mjs'

const [consumerArgument, outputArgument, kind, mode, sourceArgument] =
  process.argv.slice(2)
const scenarios = {
  auth: [
    'route-render-auth',
    'auth-route.case.jsx',
    '/[tenant]/access/[...slug]',
    'FULL_ROUTE_AUTH ',
    8,
  ],
  'not-found': [
    'route-render-not-found',
    'not-found-route.case.jsx',
    '/[tenant]/missing/[...slug]',
    'FULL_ROUTE_NOT_FOUND ',
    4,
  ],
  'late-redirect': [
    'late-streamed-redirect',
    'late-redirect.case.jsx',
    '/[tenant]/late-redirect/[...slug]',
    'BUFFERED_LATE_REDIRECT ',
    6,
  ],
  'stream-redirect': [
    'route-stream',
    'live-late-redirect.case.jsx',
    '/[tenant]/late-redirect/[...slug]',
    'LIVE_LATE_REDIRECT ',
    6,
  ],
  'stream-ownership': [
    'route-stream',
    'owner.case.jsx',
    '/[tenant]/stream-owner/[...slug]',
    'LIVE_STREAM_OWNER ',
    8,
  ],
  errors: [
    'route-render-errors',
    null,
    null,
    'ROUTE_RENDER_ERROR_SEMANTIC ',
    2,
  ],
}
assert(
  consumerArgument && outputArgument && kind in scenarios,
  'consumer, output and route scenario required'
)
assert(
  ['development', 'production'].includes(mode),
  'compilation mode required'
)
const consumer = resolve(consumerArgument)
const output = resolve(outputArgument)
const require = createRequire(join(consumer, 'package.json'))
assert(sourceArgument === undefined || sourceArgument === '--source')
if (!sourceArgument)
  for (const name of ['vitest', 'vite'])
    assert.throws(() => require.resolve(name))
const next = require.resolve('next/dist/bin/next')
const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')
const [source, caseFile, route, prefix, caseCount] = scenarios[kind]
mkdirSync(output, { recursive: true })
const read = (path) => JSON.parse(readFileSync(path, 'utf8'))
const save = (path, value) =>
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n')

// Only authored inputs are copied. Each run receives its own compiler outputs,
// package consumer and generated oracle; the maintained corpus stays read-only.
function stage(directory, fixture, prefix = '') {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const name = prefix + entry.name
    if (entry.isDirectory())
      stage(join(directory, entry.name), fixture, name + '/')
    else if (entry.isFile() && !name.endsWith('.json')) {
      const target = join(
        fixture,
        name.endsWith('.txt') ? name.slice(0, -4) : name
      )
      mkdirSync(dirname(target), { recursive: true })
      copyFileSync(join(directory, entry.name), target)
    }
  }
}
const env = {
  ...process.env,
  NODE_ENV: mode,
  NEXT_TELEMETRY_DISABLED: '1',
  FORCE_COLOR: '0',
}
for (const key of ['CI', 'NODE_PATH', 'NODE_OPTIONS']) delete env[key]
// The ordinary streaming capture has the same final response as the buffered
// API, with four real delayed-component barriers before redirect completion.
if (kind === 'late-redirect') {
  const ordinary = routeModel('stream-redirect', mode)
  assert.deepEqual(
    routeModel(kind, mode),
    ordinary.map(({ barrier, ...row }) => row)
  )
  assert.equal(
    ordinary.filter(
      ({ barrier }) =>
        barrier.held &&
        barrier.fallbackBeforeRelease &&
        barrier.released &&
        barrier.fallbackDigestAbsent
    ).length,
    4
  )
}
const profiles =
  kind === 'errors'
    ? (mode === 'development'
        ? ['default', 'true', 'false']
        : ['default']
      ).flatMap((flag) =>
        ['buffered', 'streaming'].flatMap((api) =>
          ['root', 'nested'].map((scope) => ({ flag, api, scope }))
        )
      )
    : [{}]
let cases = 0
for (const profile of profiles) {
  const { flag = 'default', api, scope } = profile
  const name = kind === 'errors' ? `${flag}-${api}-${scope}` : kind
  const out = join(output, name)
  const fixture = join(consumer, '.next-test-route-regression-' + randomUUID())
  mkdirSync(out)
  mkdirSync(fixture)
  try {
    const corpus = join(fixtures, source)
    const copy = (name) =>
      copyFileSync(
        join(corpus, name),
        join(fixture, name.replace(/\.txt$/, ''))
      )
    if (kind === 'errors') {
      stage(join(fixtures, 'late-streamed-redirect/app'), fixture, 'app/')
      stage(join(corpus, 'app'), fixture, 'app/')
      copy('body-row.mjs')
      copy('error-proof.mjs')
    } else if (kind.startsWith('stream-')) {
      stage(join(fixtures, 'late-streamed-redirect'), fixture)
      copy(caseFile + '.txt')
      if (kind === 'stream-ownership') {
        stage(join(corpus, 'owner-route'), fixture)
        copy('owner-row.mjs.txt')
      }
    } else stage(corpus, fixture)
    let file = caseFile
    let selectedRoute = route
    if (kind === 'errors') {
      copyFileSync(
        join(fixtures, source, `next.config-${flag}.ts.txt`),
        join(fixture, 'next.config.ts')
      )
      file = `${api}-${scope}.case.jsx`
      writeFileSync(
        join(fixture, file),
        `const api=${JSON.stringify(api)}\nconst scope=${JSON.stringify(scope)}\n` +
          readFileSync(join(fixtures, source, 'cases.jsx.txt'), 'utf8')
      )
      selectedRoute =
        '/[tenant]/render-error/' +
        (scope === 'nested' ? 'nested/' : '') +
        '[...slug]'
    }
    const expected = routeModel(kind, mode, flag)
    save(join(fixture, 'expected.json'), expected)
    save(join(fixture, 'package.json'), { private: true, type: 'module' })
    const projectName =
      kind === 'errors'
        ? `${api}-${scope}`
        : {
            auth: `auth-route-${mode}`,
            'not-found': `not-found-route-${mode}`,
            'late-redirect': 'late-streamed-redirect',
            'stream-redirect': 'route-stream-redirect',
            'stream-ownership': 'route-stream-ownership',
          }[kind]
    save(join(fixture, 'next.test.config.json'), {
      maxWorkers: 1,
      projects: [
        {
          name: projectName,
          environment: 'rsc',
          mode,
          route: selectedRoute,
          include: [file],
          fileTimeout: 60000,
        },
      ],
    })
    const result = await runOwnedNode(
      [
        next,
        'test',
        fixture,
        '--run',
        '--reporter=json',
        '--outputFile',
        join(out, 'report.json'),
      ],
      {
        cwd: fixture,
        env,
        auditDir: join(out, 'processes'),
        timeoutMs: 120000,
      }
    )
    writeFileSync(join(out, 'stdout.log'), result.stdout)
    writeFileSync(join(out, 'stderr.log'), result.stderr)
    assertOwnedNodeCompleted(result, `${kind} ${mode} ${name}`)
    const report = read(join(out, 'report.json'))
    if (kind === 'errors')
      assert.deepEqual(
        report.next.events
          .filter((event) => event.type === 'file-start')
          .map((event) => event.entry.profile),
        [
          {
            id: projectName,
            environment: 'rsc',
            mode,
            runtime: 'nodejs',
            bundler: 'turbopack',
            route: selectedRoute,
          },
        ]
      )
    const results = report.testResults.flatMap((file) => file.assertionResults)
    const rows = report.next.events
      .filter((event) => event.type === 'output')
      .flatMap((event) => event.text.split('\n'))
      .filter((line) => line.startsWith(prefix))
      .map((line) => JSON.parse(line.slice(prefix.length)))
    assert.equal(results.length, caseCount)
    if (kind === 'stream-ownership') {
      // Rejected real after() work must remain two visible failed cases.
      assert.equal(result.status, 1)
      const failed = results.filter((test) => test.status === 'failed')
      assert.equal(failed.length, 2)
      for (const test of failed) {
        assert(test.fullName.includes('after rejected'))
        assert(test.failureMessages.length > 0)
        assert(
          test.failureMessages.every((message) =>
            message.includes('Owned real AppPage after failure')
          )
        )
      }
      assert.equal(
        results.filter(
          (test) =>
            test.status === 'passed' && test.failureMessages.length === 0
        ).length,
        6
      )
    } else {
      assert.equal(result.status, 0)
      assert(
        results.every(
          (test) =>
            test.status === 'passed' && test.failureMessages.length === 0
        )
      )
    }
    assert.deepEqual(
      rows,
      kind === 'errors'
        ? expected
            .filter((row) => row.scope === scope)
            .map((row) => ({ api, row }))
        : expected
    )
    cases += results.length
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
}
save(join(output, 'VERIFIED.json'), {
  kind,
  mode,
  profiles: profiles.length,
  cases,
})
