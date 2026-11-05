import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { retry } from 'next-test-utils'

const repository = path.resolve(__dirname, '../../../..')
const consumer =
  process.env.NEXT_TESTING_SHARED_RSC_WATCH_CONSUMER ?? repository
const nativeRequire = createRequire(path.join(consumer, 'package.json'))
const { importFixtureModule, fixtureFiles, resolveFixturePath } = nativeRequire(
  path.join(repository, 'test/lib/next-testing-fixtures.cjs')
) as typeof import('../../../lib/next-testing-fixtures.cjs')
type ProcessSupervisor =
  typeof import('../../../e2e/app-dir/next-testing-package/process-supervisor.mjs')
let runOwnedNode: ProcessSupervisor['runOwnedNode']
let assertOwnedNodeCompleted: ProcessSupervisor['assertOwnedNodeCompleted']
beforeAll(async () => {
  ;({ runOwnedNode, assertOwnedNodeCompleted } = await importFixtureModule(
    path.join(
      repository,
      'test/e2e/app-dir/next-testing-package/process-supervisor.mjs'
    )
  ))
})
const corpusDirectory = path.join(
  repository,
  'test/unit/next-testing-compiler/fixtures/shared-rsc'
)
const sourceDirectory = path.join(corpusDirectory, 'sources')
const sources: Record<string, Buffer> = {}
for (const file of fixtureFiles(sourceDirectory)) {
  sources[file.replace(/\.txt$/, '')] = readFileSync(
    resolveFixturePath(path.join(sourceDirectory, file))
  )
}
const corpus = { sources }
const binary = nativeRequire.resolve('next/dist/bin/next')
const retained = process.env.NEXT_TESTING_SHARED_RSC_WATCH_EVIDENCE
const output =
  retained ?? mkdtempSync(path.join(tmpdir(), 'next-shared-rsc-watch-'))
mkdirSync(output, { recursive: true })
const environment: NodeJS.ProcessEnv = {
  NODE_ENV: 'development',
  NEXT_TELEMETRY_DISABLED: '1',
  TURBO_TASKS_AVAILABLE_PARALLELISM: '4',
  CI: '1',
  FORCE_COLOR: '0',
}
for (const key of ['HOME', 'PATH', 'TMPDIR', 'LANG', 'SHELL'] as const) {
  const value = process.env[key]
  if (value !== undefined) environment[key] = value
}
const save = (file: string, value: unknown) =>
  writeFileSync(path.join(output, file), JSON.stringify(value, null, 2) + '\n')

function stage(version: 'A' | 'B') {
  const directory = mkdtempSync(path.join(consumer, '.next-test-shared-watch-'))
  for (const [file, body] of Object.entries(corpus.sources)) {
    const destination = path.join(directory, file)
    mkdirSync(path.dirname(destination), { recursive: true })
    writeFileSync(destination, body)
  }
  if (version === 'B')
    writeFileSync(
      path.join(directory, 'shared-state.mjs'),
      corpus.sources['shared-state.mjs']
        .toString()
        .replace("version: 'A'", "version: 'B'")
    )
  writeFileSync(
    path.join(directory, 'package.json'),
    '{"private":true,"type":"module"}\n'
  )
  writeFileSync(
    path.join(directory, 'next.config.mjs'),
    'export default ' +
      JSON.stringify({
        cacheComponents: false,
        turbopack: { root: consumer },
        experimental: { turbopackSharedRuntime: true },
      }) +
      '\n'
  )
  return directory
}

function owned(args: string[], directory: string, name: string) {
  const auditDir = path.join(output, name + '-owners')
  let result: Awaited<ReturnType<typeof runOwnedNode>> | undefined
  const finished = runOwnedNode(args, {
    cwd: directory,
    env: name.startsWith('ordinary-')
      ? {
          ...environment,
          NEXT_TELEMETRY_DEBUG: '1',
          __NEXT_DEV_WAIT_FOR_TURBOPACK_SHUTDOWN: '1',
        }
      : environment,
    auditDir,
    timeoutMs: name === 'watch' ? 240000 : 120000,
  }).then((value) => {
    result = value
    save(name + '-owner.json', value)
    return value
  })
  async function stop() {
    if (!result) {
      const root = await retry(
        () => {
          const entries = readFileSync(
            path.join(auditDir, 'starts.jsonl'),
            'utf8'
          )
            .split('\n')
            .slice(0, -1)
            .map((line) => JSON.parse(line))
          const entry = entries.find(
            (entry) => entry.type === 'start' && entry.ppid === process.pid
          )
          assert(entry, 'Actual owned CLI startup must be observed')
          return entry
        },
        10000,
        100
      )
      if (!result) {
        try {
          const started = execFileSync(
            '/bin/ps',
            ['-p', String(root.pid), '-o', 'lstart='],
            { encoding: 'utf8' }
          )
            .trim()
            .replace(/\s+/g, ' ')
          assert.equal(
            started,
            root.started,
            'Never signal a reused process ID'
          )
          process.kill(root.pid, 'SIGINT')
        } catch (error) {
          if (!result) throw error
        }
      }
    }
    return finished
  }
  return { finished, stop, result: () => result }
}

async function port() {
  const reservation = createServer()
  await new Promise<void>((resolve, reject) => {
    reservation.once('error', reject)
    reservation.listen(0, '127.0.0.1', resolve)
  })
  const address = reservation.address()
  assert(address && typeof address === 'object')
  await new Promise<void>((resolve, reject) =>
    reservation.close((error) => (error ? reject(error) : resolve()))
  )
  return address.port
}

let ordinaryWork: Promise<unknown[][]> | undefined
function ordinary() {
  return (ordinaryWork ??= (async () => {
    const generations: unknown[][] = []
    for (const [index, version] of (['A', 'B', 'B'] as const).entries()) {
      const directory = stage(version)
      const allocated = await port()
      const run = owned(
        [
          binary,
          'dev',
          directory,
          '--hostname',
          '127.0.0.1',
          '--port',
          String(allocated),
        ],
        directory,
        'ordinary-' + index
      )
      try {
        await retry(
          async () => {
            assert(!run.result(), 'Ordinary Next application must remain open')
            const response = await fetch(
              'http://127.0.0.1:' + allocated + '/',
              { signal: AbortSignal.timeout(1000) }
            )
            assert(
              [200, 404].includes(response.status),
              'Ordinary application has started'
            )
          },
          60000,
          100
        )
        const { sharedRouteRow } = await importFixtureModule(
          path.join(directory, 'row.mjs')
        )
        const rows = []
        for (const [count, request] of [
          { id: 'one', label: 'first', language: 'en', cookie: 'one' },
          { id: 'two', label: 'second', language: 'fr', cookie: 'two' },
        ].entries()) {
          const response = await fetch(
            'http://127.0.0.1:' +
              allocated +
              '/shared/' +
              request.id +
              '?label=' +
              request.label,
            {
              headers: {
                'accept-language': request.language,
                cookie: 'scope=' + request.cookie,
              },
              signal: AbortSignal.timeout(30000),
            }
          )
          const body = await response.text()
          writeFileSync(
            path.join(output, 'ordinary-' + index + '-' + count + '.html'),
            body
          )
          const row = sharedRouteRow({
            status: response.status,
            contentType: response.headers.get('content-type'),
            body,
          })
          expect(row).toEqual({
            status: 200,
            contentType: 'text/html; charset=utf-8',
            layout: 'actual-layout',
            layoutLanguage: request.language,
            subject: {
              version,
              count: count + 1,
              id: request.id,
              label: request.label,
              language: request.language,
              cookie: request.cookie,
            },
          })
          rows.push({ file: count === 0 ? 'first' : 'second', row })
        }
        generations.push(rows)
      } finally {
        const result = await run.stop()
        assertOwnedNodeCompleted(result, 'Ordinary application cohort ' + index)
        assert.equal(result.status, 0)
        rmSync(directory, { recursive: true, force: true })
      }
    }
    save('ORDINARY.json', {
      actualNode: process.version,
      generations,
      freshApplicationPerGeneration: true,
      strictOwnersJoined: true,
      ordinaryShutdownProfile:
        'cooperative native shutdown and synchronous disabled telemetry',
      defaultDetachedShutdownStillUnqualified: true,
    })
    return generations
  })())
}

let ordinaryPassed = false
let watchPassed = false
it('retains ordinary application cohorts across the shared dependency versions', async () => {
  expect(await ordinary()).toHaveLength(3)
  ordinaryPassed = true
}, 480000)

it('reruns the complete shared RSC cohort after a dependency or one test file changes', async () => {
  const expected = await ordinary()
  const directory = stage('A')
  writeFileSync(
    path.join(directory, 'next.test.config.json'),
    JSON.stringify({
      test: {
        fileParallelism: false,
        maxWorkers: 1,
        sequence: { seed: 1, shuffle: false },
        projects: [
          {
            name: 'shared-rsc',
            environment: 'rsc',
            mode: 'development',
            route: '/shared/[id]',
            isolate: false,
            include: ['first.case.mjs', 'second.case.mjs'],
            testTimeout: 10000,
            hookTimeout: 10000,
          },
        ],
      },
    }) + '\n'
  )
  const reportFile = path.join(directory, 'report.json')
  const run = owned(
    [
      binary,
      'test',
      directory,
      '--watch',
      '--reporter=json',
      '--outputFile',
      reportFile,
    ],
    directory,
    'watch'
  )
  let previousRun: string | undefined
  try {
    for (let generation = 0; generation < 3; generation++) {
      const priorRun = previousRun
      const report = await retry(
        () => {
          assert(!run.result(), 'Watch must remain open')
          assert(existsSync(reportFile), 'A complete report must be published')
          const value = JSON.parse(readFileSync(reportFile, 'utf8'))
          assert.notEqual(value.next?.summary.runId, priorRun)
          assert.equal(value.success, true)
          assert.equal(value.numTotalTests, 2)
          assert.equal(value.numPassedTests, 2)
          assert.equal(value.numFailedTests, 0)
          return value
        },
        60000,
        100
      )
      const cases = report.testResults.flatMap((file) => file.assertionResults)
      expect(
        cases.map(({ fullName, status, failureMessages }) => ({
          fullName,
          status,
          failureMessages,
        }))
      ).toEqual([
        {
          fullName:
            'first shared RSC file retains its actual request and shared module',
          status: 'passed',
          failureMessages: [],
        },
        {
          fullName:
            'second shared RSC file retains its own request and the same module',
          status: 'passed',
          failureMessages: [],
        },
      ])
      const rows = report.next.events
        .filter((event) => event.type === 'output')
        .flatMap((event) => event.text.split('\n'))
        .filter((line) => line.startsWith('SHARED_RSC_ROW '))
        .map((line) => JSON.parse(line.slice('SHARED_RSC_ROW '.length)))
      expect(rows).toEqual(expected[generation])
      expect(report.next.summary.files).toEqual({
        passed: 2,
        failed: 0,
        skipped: 0,
        cancelled: 0,
      })
      save('watch-generation-' + generation + '.json', report)
      previousRun = report.next.summary.runId
      if (generation === 0)
        writeFileSync(
          path.join(directory, 'shared-state.mjs'),
          corpus.sources['shared-state.mjs']
            .toString()
            .replace("version: 'A'", "version: 'B'")
        )
      else if (generation === 1)
        writeFileSync(
          path.join(directory, 'second.case.mjs'),
          corpus.sources['second.case.mjs'].toString() +
            '\n// Changed test file must retain its complete shared cohort.\n'
        )
    }
  } finally {
    const result = await run.stop()
    assertOwnedNodeCompleted(result, 'Shared RSC watch')
    assert.equal(result.status, 130)
    rmSync(directory, { recursive: true, force: true })
  }
  watchPassed = true
}, 480000)

afterAll(() => {
  save('CLOSED.json', {
    ordinaryPassed,
    watchPassed,
    allStrictOwnedClosuresChecked: ordinaryPassed && watchPassed,
  })
  if (!retained && ordinaryPassed && watchPassed)
    rmSync(output, { recursive: true, force: true })
})
