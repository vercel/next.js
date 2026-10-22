const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const repo = path.resolve(__dirname, '../../..')
const runtime = path.join(repo, 'packages/next/dist/experimental/testing')
const sources = path.join(__dirname, 'fixtures/orderly-cancel')
const mode = process.argv.find((value) => value.startsWith('--mode='))?.slice(7)
const scenario =
  process.argv.find((value) => value.startsWith('--scenario='))?.slice(11) ??
  'pending'

async function main() {
  if (!mode) {
    let profiles = 0
    for (const selected of ['development', 'production'])
      for (const variant of ['pending', 'signal-rejection']) {
        const child = spawnSync(
          process.execPath,
          [__filename, `--mode=${selected}`, `--scenario=${variant}`],
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
        cases: 8,
        completeReports: 4,
        closedWorkers: 4,
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
  const authored = fs.readFileSync(
    path.join(
      sources,
      scenario === 'pending'
        ? 'contract.case.mjs.txt'
        : 'signal-rejection.case.mjs.txt'
    )
  )
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
  let observedBody = false
  let published = false
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
      .readFileSync(path.join(root, 'cancel-settlement/trace.jsonl'), 'utf8')
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
    watcher = fs.watch(root, () => {
      if (
        !fs.existsSync(path.join(root, 'gate-started')) ||
        user.signal.aborted
      )
        return
      assert.equal(
        trace().some(({ event }) => event === 'body-start'),
        true
      )
      observedBody = true
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
        onEvent(event) {
          events.push(event)
        },
        async onCoverage(capture) {
          assert.equal(observedBody, true)
          assert.equal(capture.complete, true)
          assert.equal(lifetime.signal.aborted, false)
          const worker = trace().find(({ event }) => event === 'body-start').pid
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
      { ...process.env, NODE_ENV: mode }
    )
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
      // This private producer retains normal code-zero termination; public
      // watch composition must account for that observable difference.
      [...expected.trace, { event: 'worker-exit', code: 0 }]
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
    await session?.dispose()
    fs.promises.mkdtemp = createDirectory
    fs.rmSync(root, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
