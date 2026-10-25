const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const repo = path.resolve(__dirname, '../../..')
const runtime = path.join(repo, 'packages/next/dist/experimental/testing')
const sources = path.join(__dirname, 'fixtures/orderly-cancel')
const mode = process.argv.find((value) => value.startsWith('--mode='))?.slice(7)
const control = process.argv
  .find((value) => value.startsWith('--control='))
  ?.slice(10)
const scenario =
  process.argv.find((value) => value.startsWith('--scenario='))?.slice(11) ??
  'pending'

const snapshotMode =
  process.argv
    .find((value) => value.startsWith('--snapshot-mode='))
    ?.slice(16) ?? 'none'
const snapshotIntent = process.argv
  .find((value) => value.startsWith('--snapshot-intent='))
  ?.slice(18)
const expectedFailure =
  !!control || (!!snapshotIntent && snapshotIntent !== 'read-only')

async function main() {
  if (!mode) {
    let profiles = 0
    for (const selected of ['development', 'production'])
      for (const variant of [
        'pending',
        'signal-rejection',
        'beforeEach',
        'cleanup',
        'beforeEach-throw',
      ]) {
        const child = spawnSync(
          process.execPath,
          [
            __filename,
            `--mode=${selected}`,
            `--scenario=${variant}`,
            `--snapshot-mode=${snapshotMode}`,
          ],
          {
            env: { ...process.env, NODE_ENV: selected },
            encoding: 'utf8',
            timeout: 90000,
          }
        )
        assert.equal(child.error, undefined)
        assert.equal(child.signal, null)
        assert.equal(child.status, 0, child.stdout + child.stderr)
        const summaries = child.stdout
          .split('\n')
          .filter((line) => line.startsWith('{"mode":'))
        assert.equal(summaries.length, 1, child.stdout + child.stderr)
        assert.deepEqual(JSON.parse(summaries[0]), {
          mode: selected,
          cases: 2,
          completeReports: 1,
          closedWorkers: 1,
        })
        profiles++
      }
    process.stdout.write(
      JSON.stringify({
        profiles,
        cases: 20,
        completeReports: 10,
        closedWorkers: 10,
      }) + '\n'
    )
    return
  }
  const { createTestCompilerSession } = require(runtime + '/compiler')
  const { executeWithEnvironment } = require(runtime + '/execution/execute')
  const { remapStandardCoverage } = require(runtime + '/coverage/istanbul')
  const { publishStandardCoverage } = require(
    runtime + '/coverage/report-standard'
  )
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(repo, '.next-test-orderly-cancel-'))
  )
  const expected = JSON.parse(
    fs.readFileSync(path.join(sources, 'pristine.json'))
  )[mode][scenario]
  let authored = fs.readFileSync(
    path.join(
      sources,
      {
        pending: 'contract.case.mjs.txt',
        'signal-rejection': 'signal-rejection.case.mjs.txt',
        beforeEach: 'before-each.case.mjs.txt',
        cleanup: 'cleanup.case.mjs.txt',
        'beforeEach-throw': 'before-each-throw.case.mjs.txt',
      }[scenario]
    )
  )
  if (snapshotIntent) {
    assert.equal(scenario, 'pending')
    const assertion = {
      file: `  expect('snapshot writer').toMatchSnapshot()`,
      inline: `  expect('snapshot writer').toMatchInlineSnapshot()`,
      path: `  await expect('snapshot writer').toMatchFileSnapshot('./authored-output.txt')`,
      'read-only': `  expect('snapshot reader').toMatchInlineSnapshot('"snapshot reader"')`,
      'cleanup-failure': `  expect('snapshot writer').toMatchSnapshot()`,
    }[snapshotIntent]
    assert.equal(typeof assertion, 'string')
    authored = Buffer.from(
      authored
        .toString()
        .replace(
          "  record('body-start')",
          assertion + "\n  record('body-start')"
        ) +
        (snapshotIntent === 'cleanup-failure'
          ? "\nafterEach(() => { throw new Error('actual snapshot cleanup failure') })\n"
          : '')
    )
  }
  fs.writeFileSync(path.join(root, 'contract.case.mjs'), authored)
  fs.copyFileSync(
    path.join(
      repo,
      'test/unit/app-dir/next-testing-stable-release-gaps/fixtures/standard-coverage/subject.mjs'
    ),
    path.join(root, 'subject.mjs')
  )
  fs.writeFileSync(path.join(root, 'next.config.mjs'), 'export default {}\n')
  fs.writeFileSync(path.join(root, 'package.json'), '{"private":true}\n')
  if (control)
    fs.copyFileSync(
      path.join(sources, 'finalization-control.cjs'),
      path.join(root, 'finalization-control.cjs')
    )
  const profile = {
    id: 'orderly-node',
    mode,
    environment: 'node',
    runtime: 'nodejs',
    bundler: 'turbopack',
  }
  const entry = {
    id: 'orderly-node:contract.case.mjs',
    file: path.join(root, 'contract.case.mjs'),
    profile,
  }
  const lifetime = new AbortController()
  const user = new AbortController()
  const events = []
  let session
  let watcher
  let traceWatcher
  let observedExecution = false
  let published = false
  let captureAttempts = 0
  const traceDirectory = scenario.startsWith('beforeEach')
    ? 'beforeeach-cancel'
    : scenario === 'cleanup'
      ? 'cleanup-context-cancel'
      : 'cancel-settlement'
  const hook = scenario.startsWith('beforeEach') || scenario === 'cleanup'
  const gate = scenario.startsWith('beforeEach')
    ? 'hook'
    : scenario === 'cleanup'
      ? 'cleanup'
      : 'gate'
  const observedEvent = scenario.startsWith('beforeEach')
    ? 'beforeEach-start'
    : scenario === 'cleanup'
      ? 'afterEach-start'
      : 'body-start'
  const cacheDirectories = []
  const createDirectory = fs.promises.mkdtemp
  fs.promises.mkdtemp = async (...args) => {
    const directory = await createDirectory(...args)
    if (path.basename(directory).startsWith('next-test-cache-'))
      cacheDirectories.push(directory)
    return directory
  }
  const trace = () =>
    fs
      .readFileSync(path.join(root, traceDirectory, 'trace.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
  const alive = (pid) => {
    try {
      process.kill(pid, 0)
      return true
    } catch (error) {
      if (error.code !== 'ESRCH') throw error
      return false
    }
  }
  try {
    session = await createTestCompilerSession(root, profile)
    const artifact = await session.compile(entry, {
      signal: lifetime.signal,
      coverage: { version: 1, kind: 'node-line' },
    })
    assert.deepEqual(
      artifact.diagnostics.filter((item) => item.severity === 'error'),
      []
    )
    const releaseHook = () => {
      if (
        !hook ||
        !user.signal.aborted ||
        fs.existsSync(path.join(root, gate + '-release')) ||
        !trace().some(({ event }) => event === 'hook-signal-aborted')
      )
        return
      assert.equal(
        trace().some(
          ({ event }) =>
            event ===
            (scenario.startsWith('beforeEach')
              ? 'first-body'
              : 'afterEach-finished')
        ),
        false
      )
      fs.writeFileSync(path.join(root, gate + '-release'), 'release')
    }
    watcher = fs.watch(root, () => {
      if (
        !fs.existsSync(path.join(root, gate + '-started')) ||
        user.signal.aborted
      )
        return
      assert.equal(
        trace().some(({ event }) => event === observedEvent),
        true
      )
      observedExecution = true
      if (hook)
        traceWatcher = fs.watch(path.join(root, traceDirectory), releaseHook)
      user.abort()
    })
    const completion = await executeWithEnvironment(
      artifact,
      {
        runId: 'orderly-cancel',
        signal: lifetime.signal,
        userCancelSignal: user.signal,
        projectDir: root,
        entry,
        setupFiles: [],
        testTimeout: 10000,
        hookTimeout: 1000,
        fileTimeout: 20000,
        coverage: { version: 1, kind: 'node-line' },
        snapshotUpdateMode: snapshotMode,
        onEvent(event) {
          events.push(event)
        },
        async onCoverage(capture) {
          captureAttempts++
          assert.equal(
            expectedFailure,
            false,
            'An invalid finalization published.'
          )
          assert.equal(observedExecution, true)
          assert.equal(capture.complete, true)
          assert.equal(lifetime.signal.aborted, false)
          const worker = trace().find(
            ({ event }) => event === observedEvent
          ).pid
          assert.equal(alive(worker), false)
          assert.equal(alive(-worker), false)
          assert.notEqual(cacheDirectories.length, 0)
          assert.equal(
            cacheDirectories.every((directory) => !fs.existsSync(directory)),
            true
          )
          const fact = await remapStandardCoverage(
            artifact,
            capture.data,
            (file) => path.basename(file) === 'subject.mjs'
          )
          await publishStandardCoverage({
            projectDir: root,
            facts: [fact],
            expected: new Set([entry.id]),
            excludedFiles: [entry.file],
            config: {
              reporter: ['json'],
              include: ['subject.mjs'],
              exclude: [],
              reportsDirectory: 'reports',
              reportOnFailure: true,
              thresholds: {},
            },
            status: 'passed',
            includeUnimported: false,
            signal: lifetime.signal,
          })
          published = true
        },
      },
      {
        ...process.env,
        NODE_ENV: mode,
        ...(control
          ? {
              NODE_OPTIONS:
                '--require ' + path.join(root, 'finalization-control.cjs'),
              NEXT_TEST_FINALIZATION_CONTROL: control,
            }
          : {}),
      }
    ).catch((error) => {
      if (!expectedFailure) throw error
      assert(error instanceof Error)
      return { status: 'failed' }
    })
    if (expectedFailure) {
      assert.equal(completion.status, 'failed')
      assert.equal(observedExecution, true)
      assert.equal(captureAttempts, 0)
      assert.equal(published, false)
      assert.equal(lifetime.signal.aborted, false)
      const worker = trace().find(({ event }) => event === observedEvent).pid
      assert.equal(alive(worker), false)
      assert.equal(alive(-worker), false)
      assert.notEqual(cacheDirectories.length, 0)
      assert.equal(
        cacheDirectories.every((directory) => !fs.existsSync(directory)),
        true
      )
      assert.deepEqual(fs.readFileSync(entry.file), authored)
      assert.equal(fs.existsSync(path.join(root, '__snapshots__')), false)
      assert.equal(fs.existsSync(path.join(root, 'authored-output.txt')), false)
      process.stdout.write(
        JSON.stringify({
          mode,
          control: control ?? `snapshot-${snapshotIntent}`,
          captures: 0,
          closedWorkers: 1,
        }) + '\n'
      )
      return
    }
    assert.equal(completion.status, 'passed')
    assert.equal(published, true)
    assert.equal(
      events.some(({ type }) => type === 'diagnostic'),
      false
    )
    assert.deepEqual(
      events
        .filter(({ type }) => type === 'case-end')
        .map((event) => ({
          fullName: event.name,
          status: event.status,
          failureMessages: event.errors.map(({ message }) => message),
        })),
      expected.cases
    )
    assert.deepEqual(
      trace().map(({ pid, threadId, ...event }) => event),
      // Genuine user cancellation kills its fork without an exit listener.
      // The parent stops this worker only after its final cleanup/capture seal.
      expected.trace
    )
    const report = JSON.parse(
      fs.readFileSync(path.join(root, 'reports/coverage-final.json'))
    )
    assert.deepEqual(
      Object.fromEntries(
        Object.entries(report).map(([file, data]) => [
          path.basename(file),
          { ...data, path: path.basename(data.path) },
        ])
      ),
      expected.coverage
    )
    assert.deepEqual(fs.readFileSync(entry.file), authored)
    process.stdout.write(
      JSON.stringify({ mode, cases: 2, completeReports: 1, closedWorkers: 1 }) +
        '\n'
    )
  } finally {
    watcher?.close()
    traceWatcher?.close()
    await session?.dispose()
    fs.promises.mkdtemp = createDirectory
    fs.rmSync(root, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
