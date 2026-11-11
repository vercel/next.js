import { resolveFixturePath } from '../../lib/next-testing-fixtures.cjs'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'

const [rootArg, outputArg] = process.argv.slice(2)
assert(rootArg && outputArg)
const root = resolve(rootArg),
  output = resolve(outputArg)
const mode = process.argv.includes('--production')
  ? 'production'
  : 'development'
const corpus = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures/node-project-env'
)
const profiles = ['omitted', 'false', 'true'].map((unstub) => ({ unstub }))
const templates = new Map()
for (const name of [
  'package.json.txt',
  'subject.mjs.txt',
  'contract.test.mjs.txt',
  'setup.mjs.txt',
  'global-setup.mjs.txt',
])
  templates.set(
    name,
    await readFile(resolveFixturePath(join(corpus, name)), 'utf8')
  )
const load = createRequire(join(root, 'package.json'))
if (!process.argv.includes('--source'))
  for (const name of ['vitest', 'vite', '@vitest/mocker'])
    assert.throws(() => load.resolve(name))
const next = process.argv.includes('--source')
  ? join(root, 'packages/next/dist/bin/next')
  : load.resolve('next/dist/bin/next')
const envNames = [
  'WS2_NODE_ENV_VALUE',
  'WS2_NODE_ENV_ROOT',
  'WS2_NODE_ENV_ADDED',
  'WS2_NODE_ENV_APP',
  'NEXT_PUBLIC_WS2_NODE_ENV',
  'NODE_CUSTOM_ENV',
  '__CUSTOM_ENV',
]
const parentBefore = envNames.map((name) => [name, process.env[name]])
const prepared = [],
  facts = []
let readersClosed = true
await mkdir(output, { recursive: true })
for (const profile of profiles) {
  const fixture = await mkdtemp(join(root, '.next-test-node-project-env-')),
    evidence = join(output, profile.unstub)
  await mkdir(evidence)
  const globalTrace = join(evidence, 'global-setup.jsonl'),
    exitTrace = join(evidence, 'worker-exit.jsonl')
  const modules = join(fixture, 'node_modules')
  await mkdir(modules)
  for (const name of await readdir(join(root, 'node_modules'))) {
    if (['.vite', '.vite-temp', '.cache', '.vitest-cache'].includes(name))
      await mkdir(join(modules, name))
    else await symlink(join(root, 'node_modules', name), join(modules, name))
  }
  const sources = new Map()
  for (const [name, template] of templates) {
    const source = template
      .replaceAll('__GLOBAL_TRACE_JSON__', JSON.stringify(globalTrace))
      .replaceAll('__EXIT_TRACE_JSON__', JSON.stringify(exitTrace))
    const file = name.replace(/\.txt$/, '')
    await writeFile(join(fixture, file), source)
    sources.set(file, source)
  }
  await writeFile(
    join(fixture, 'next.test.config.mjs'),
    `export default {test:{mode:${JSON.stringify(mode)},name:'node-env',include:['*.test.mjs'],setupFiles:['./setup.mjs'],globalSetup:['./global-setup.mjs'],maxWorkers:1,${profile.unstub === 'omitted' ? '' : `unstubEnvs:${profile.unstub},`}env:{WS2_NODE_ENV_VALUE:'configured',WS2_NODE_ENV_ROOT:'root-only',NODE_CUSTOM_ENV:'configured-node',__CUSTOM_ENV:'configured-underscore'}}}\n`
  )
  await writeFile(
    join(fixture, 'next.config.mjs'),
    'export default ' + JSON.stringify({ turbopack: { root } }) + '\n'
  )
  prepared.push({
    profile,
    fixture,
    evidence,
    globalTrace,
    exitTrace,
    sources,
  })
}
try {
  for (const {
    profile,
    fixture,
    evidence,
    globalTrace,
    exitTrace,
    sources,
  } of prepared) {
    const reportPath = join(evidence, 'report.json')
    const env = {
      ...process.env,
      PATH: dirname(process.execPath) + ':' + process.env.PATH,
      NODE_ENV: mode,
      NEXT_TELEMETRY_DISABLED: '1',
      FORCE_COLOR: '0',
      TURBO_TASKS_AVAILABLE_PARALLELISM: '4',
      WS2_NODE_ENV_VALUE: 'host',
      WS2_NODE_ENV_ROOT: 'host-root',
      WS2_NODE_ENV_APP: 'host-app',
      NEXT_PUBLIC_WS2_NODE_ENV: 'host-public',
      NODE_CUSTOM_ENV: 'host-node',
      __CUSTOM_ENV: 'host-underscore',
    }
    for (const key of [
      'CI',
      'NODE_OPTIONS',
      'NODE_PATH',
      'NEXT_TEST_NATIVE_DIR',
      'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
      'WS2_NODE_ENV_ADDED',
    ])
      delete env[key]
    readersClosed = false
    const owner = await runOwnedNode(
      [
        next,
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
        auditDir: join(evidence, 'owners'),
      }
    )
    await writeFile(
      join(evidence, 'OWNER.json'),
      JSON.stringify(owner, null, 2) + '\n'
    )
    await writeFile(join(evidence, 'stdout.log'), owner.stdout)
    await writeFile(join(evidence, 'stderr.log'), owner.stderr)
    assertOwnedNodeCompleted(owner, profile.unstub)
    readersClosed = true
    const report = JSON.parse(await readFile(reportPath, 'utf8'))
    const actual = {
      unstub: profile.unstub,
      exit: owner.status,
      cases: report.testResults.flatMap((file) =>
        file.assertionResults.map((test) => ({
          name: test.fullName,
          status: test.status,
          failureMessages: test.failureMessages,
        }))
      ),
      rows: report.next.events
        .filter((event) => event.type === 'output')
        .flatMap((event) => event.text.split('\n'))
        .filter((line) => line.startsWith('ENV208:'))
        .map((line) => JSON.parse(line.slice(7))),
      globalRows: (await readFile(globalTrace, 'utf8'))
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(JSON.parse),
    }
    await writeFile(
      join(evidence, 'ACTUAL.json'),
      JSON.stringify(actual, null, 2) + '\n'
    )
    assert.equal(owner.status, 0, owner.stderr)
    assert.equal(report.success, true)
    assert.deepEqual(
      actual.cases.map(({ name, status, failureMessages }) => [
        name,
        status,
        failureMessages,
      ]),
      [
        ['stub project environment', 'passed', []],
        ['restore project environment', 'passed', []],
      ]
    )
    assert.deepEqual(
      actual.rows.map(({ phase }) => phase),
      [
        'setup',
        'module',
        'beforeAll',
        'body-first',
        'stubbed',
        'afterEach',
        'finished-first',
        'body-second',
        'restored',
        'afterEach',
        'afterAll',
        'setup-afterAll',
        'file-fixture-cleanup',
        'worker-fixture-cleanup',
      ]
    )
    const assertContext = (row, configured, stubbed = false) => {
      assert.equal(
        row.value,
        stubbed ? 'stubbed' : configured ? 'configured' : 'host'
      )
      assert.equal(
        row.root,
        stubbed ? null : configured ? 'root-only' : 'host-root'
      )
      assert.equal(row.added, stubbed ? 'added' : null)
      assert.equal(row.nodeLiteral, mode)
      assert.equal(row.nodeComputed, mode)
      for (const key of ['publicLiteral', 'publicComputed'])
        assert.equal(row[key], 'host-public')
      for (const key of ['appLiteral', 'appComputed'])
        assert.equal(row[key], 'host-app')
      assert.equal(
        row.nodePrefixed,
        configured ? 'configured-node' : 'host-node'
      )
      assert.equal(
        row.underscorePrefixed,
        configured ? 'configured-underscore' : 'host-underscore'
      )
    }
    for (const [index, row] of actual.rows.entries())
      assertContext(
        row,
        true,
        (index >= 4 && index <= 6) || (index === 7 && profile.unstub !== 'true')
      )
    assert.deepEqual(
      actual.globalRows.map(({ phase }) => phase),
      ['global-setup', 'global-teardown']
    )
    for (const row of actual.globalRows) assertContext(row, false)
    const exitRows = (await readFile(exitTrace, 'utf8'))
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(JSON.parse)
    await writeFile(
      join(evidence, 'SOURCE-EXIT-RESTORATION.json'),
      JSON.stringify(
        {
          sourceOnlyResourceGuard: true,
          genuineExitCallbackNotObserved: true,
          rows: exitRows,
        },
        null,
        2
      ) + '\n'
    )
    assert.equal(exitRows.length, 1)
    assert.equal(exitRows[0].phase, 'worker-exit')
    assertContext(exitRows[0], false)
    for (const [file, source] of sources)
      assert.equal(await readFile(join(fixture, file), 'utf8'), source)
    assert.deepEqual(
      envNames.map((name) => [name, process.env[name]]),
      parentBefore
    )
    facts.push({
      unstub: profile.unstub,
      environmentLifecycleAndRestoration: true,
      actualWorkerExitRestoredHostValues: true,
      sourceBytesHeld: true,
      ownersClosed: true,
    })
    await writeFile(
      join(output, 'PROGRESS.json'),
      JSON.stringify({ facts }, null, 2) + '\n'
    )
  }
} finally {
  if (readersClosed)
    for (const { fixture } of prepared)
      await rm(fixture, { recursive: true, force: true })
}
await writeFile(
  join(output, 'CHECKS.json'),
  JSON.stringify(
    {
      profiles: facts.length,
      environmentLifecycleAndRestoration: true,
      actualWorkerExitRestoredHostValues: true,
      parentEnvironmentUnchanged: true,
      allOwnersJoined: readersClosed,
      authoredBytesHeld: true,
    },
    null,
    2
  ) + '\n'
)
