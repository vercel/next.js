import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { watch } from 'node:fs'
import { once } from 'node:events'
import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  writeFile,
  access,
} from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const [nextPackage, workRoot, evidence] = process.argv.slice(2)
assert(nextPackage && workRoot && evidence)
await mkdir(workRoot, { recursive: true })
await mkdir(evidence, { recursive: true })
const fixture = fileURLToPath(
  new URL('./fixtures/editor-cancel/', import.meta.url)
)
const load = createRequire(import.meta.url)
const { acquireTestRunLock } = load(
  join(nextPackage, 'dist/experimental/testing/scheduling.js')
)
function deferred() {
  let resolve
  const promise = new Promise((done) => {
    resolve = done
  })
  return { promise, resolve }
}
async function execute(mode, control) {
  const label = mode + '-' + control
  const app = join(workRoot, label)
  await mkdir(app)
  for (const name of ['contract.test.mjs', 'global-setup.mjs'])
    await copyFile(join(fixture, name + '.txt'), join(app, name))
  await writeFile(join(app, 'package.json'), '{"type":"module"}\n')
  await writeFile(
    join(app, 'next.test.config.json'),
    JSON.stringify({
      maxWorkers: 1,
      projects: [
        {
          name: 'editor',
          environment: 'node',
          mode,
          include: ['contract.test.mjs'],
          globalSetup: ['global-setup.mjs'],
        },
      ],
    })
  )
  const traceFile = join(app, 'trace.jsonl')
  const reportFile = join(app, 'result.json')
  await writeFile(traceFile, '')
  const ready = deferred()
  const readiness = watch(traceFile, () => {
    void readFile(traceFile, 'utf8').then((text) => {
      if (text.includes('body active\n')) ready.resolve()
    })
  })
  const discovered = deferred()
  const args = [
    join(nextPackage, 'dist/bin/next'),
    'test',
    app,
    '--run',
    '--api',
    '0',
    '--update',
    '--reporter=json',
    '--outputFile',
    reportFile,
  ]
  const child = spawn(process.execPath, args, {
    cwd: app,
    env: {
      ...process.env,
      NODE_ENV: mode,
      NEXT_TELEMETRY_DISABLED: '1',
      NEXT_TEST_EDITOR_TRACE: traceFile,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk) => {
    stdout += chunk
    if (stdout.includes('NEXT_TEST_EDITOR_ACTIVE')) ready.resolve()
  })
  child.stderr.on('data', (chunk) => {
    stderr += chunk
    const match =
      /Next test discovery API: (http:\/\/127\.0\.0\.1:\d+\/v1\/discovery)/.exec(
        stderr
      )
    if (match) discovered.resolve(match[1])
  })
  const closed = once(child, 'close')
  const closedEarly = closed.then(([code, signal]) => {
    throw new Error(
      label +
        ' closed before readiness: ' +
        code +
        '/' +
        signal +
        '\n' +
        stdout +
        stderr
    )
  })
  let url
  let observed
  let acknowledgement
  try {
    ;[, url] = await Promise.race([
      Promise.all([ready.promise, discovered.promise]),
      closedEarly,
    ])
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) })
    assert.equal(response.status, 200)
    observed = await response.json()
    assert.deepEqual(observed.controls, { cancel: true })
    assert.equal(observed.run.status, 'running')
    assert.equal(observed.cases.length, 1)
    assert.equal(observed.cases[0].status, 'running')
    assert.equal(observed.cases[0].name, 'active public run')
    if (control === 'api') {
      const target = new URL(
        '/v1/runs/' + encodeURIComponent(observed.run.id) + '/cancel',
        url
      )
      const accepted = await fetch(target, {
        method: 'POST',
        signal: AbortSignal.timeout(5000),
      })
      assert.equal(accepted.status, 202)
      acknowledgement = await accepted.json()
      assert.deepEqual(acknowledgement, {
        version: 1,
        protocol: 'next-test-control',
        command: 'cancel',
        runId: observed.run.id,
        status: 'accepted',
      })
    } else assert.equal(child.kill('SIGINT'), true)
    const [code, signal] = await closed
    assert.equal(code, 130, stdout + stderr)
    assert.equal(signal, null)
    const report = JSON.parse(await readFile(reportFile, 'utf8'))
    assert.equal(report.next.summary.status, 'cancelled')
    assert.equal(
      report.next.events.filter((event) => event.type === 'run-end').at(-1)
        .status,
      'cancelled'
    )
    assert.equal(report.numTotalTests, 1)
    const trace = (await readFile(traceFile, 'utf8')).trim().split('\n')
    // Global setup is coordinator-owned; worker teardown is a separate async
    // owner. Cancellation waits for both without ordering their IPC delivery.
    assert.deepEqual(
      [...trace].sort(),
      [
        'global setup',
        'fixture setup',
        'body active',
        'fixture cleanup',
        'finished',
        'afterAll',
        'global teardown',
      ].sort()
    )
    assert.deepEqual(
      trace.filter((event) => !event.startsWith('global ')),
      [
        'fixture setup',
        'body active',
        'fixture cleanup',
        'finished',
        'afterAll',
      ]
    )
    assert.deepEqual(
      trace.filter((event) => event.startsWith('global ')),
      ['global setup', 'global teardown']
    )
    assert.equal(trace[0], 'global setup')
    assert(trace.indexOf('global teardown') > trace.indexOf('body active'))
    await assert.rejects(
      access(join(app, '__snapshots__', 'contract.test.mjs.snap'))
    )
    const remaining = (await readdir(app, { withFileTypes: true })).filter(
      (entry) => entry.isDirectory() && entry.name.startsWith('.next-test-')
    )
    assert.deepEqual(remaining, [])
    const lock = await acquireTestRunLock(app, { recoverSnapshots: false })
    await lock.unlock()
    await assert.rejects(fetch(url, { signal: AbortSignal.timeout(5000) }))
    for (const name of ['contract.test.mjs', 'global-setup.mjs'])
      assert.deepEqual(
        await readFile(join(app, name)),
        await readFile(join(fixture, name + '.txt'))
      )
    const result = {
      mode,
      control,
      code,
      signal,
      acknowledgement,
      actualRunAndCaseObserved: true,
      trace,
      snapshotOmitted: true,
      artifactDirectoriesReleased: true,
      applicationLockReacquired: true,
      apiClosed: true,
    }
    await writeFile(
      join(evidence, label + '.json'),
      JSON.stringify({ ...result, observed, report }, null, 2)
    )
    return result
  } finally {
    readiness.close()
    await writeFile(join(evidence, label + '.stdout'), stdout)
    await writeFile(join(evidence, label + '.stderr'), stderr)
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM')
      await closed
    }
  }
}
const results = []
for (const mode of ['development', 'production'])
  results.push(
    ...(await Promise.all(
      ['signal', 'api'].map((control) => execute(mode, control))
    ))
  )
await writeFile(
  join(evidence, 'verified.json'),
  JSON.stringify(
    { results, profiles: 2, actualPublicRuns: 4, sourceBytesUnchanged: true },
    null,
    2
  )
)
console.log(
  JSON.stringify({
    profiles: 2,
    actualPublicRuns: 4,
    cancellationAcknowledgements: 2,
    allCleanupAndSnapshotGuards: true,
  })
)
