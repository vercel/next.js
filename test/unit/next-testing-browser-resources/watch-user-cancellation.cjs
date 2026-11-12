const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createRequire } = require('node:module')
const { createServer } = require('node:http')
const { PassThrough } = require('node:stream')
const { EventEmitter } = require('node:events')
const { setTimeout: delay } = require('node:timers/promises')

// Explicit engine-matrix helper; the default resource unit suite never loads it.
const root =
  process.env.NEXT_TEST_BROWSER_CONSUMER_ROOT ||
  path.resolve(__dirname, '../../..')
const fromRoot = createRequire(path.join(root, 'package.json'))
assert.equal(fromRoot('playwright/package.json').version, '1.64.0')
const next = path.dirname(fromRoot.resolve('next/package.json'))
const { watchTests } = require(
  path.join(next, 'dist/experimental/testing/watch-orchestrator')
)
const mode = process.argv[2] || 'development'
const engine = process.argv[3] || 'chromium'
const method = process.argv[4] || 'api'
const kind = process.argv[5] || 'single'
const headless = process.argv[6]
assert.ok(headless === undefined || ['true', 'false'].includes(headless))
assert.ok(['development', 'production'].includes(mode))
assert.ok(['chromium', 'firefox'].includes(engine))
assert.ok(['api', 'keyboard'].includes(method))
assert.ok(['single', 'multi'].includes(kind))
delete process.env.CI
process.env.TERM = 'xterm'
process.env.NODE_ENV = mode
process.env.NEXT_TELEMETRY_DISABLED = '1'
const source = path.join(__dirname, 'fixtures/watch-user-cancellation')
const fixture = fs.mkdtempSync(path.join(root, '.next-watch-browser-control-'))
const output = fs.mkdtempSync(
  path.join(os.tmpdir(), 'next-watch-browser-report-')
)
const reportFile = path.join(output, 'report.json')
const signal = new AbortController()
const changed = new EventEmitter()
const input = new PassThrough(),
  terminal = new PassThrough()
input.isTTY = terminal.isTTY = true
input.isRaw = false
input.setRawMode = (value) => {
  input.isRaw = value
  return input
}
let human = '',
  errors = '',
  held = false,
  run,
  runClosed = false,
  failure
const events = [],
  requests = [],
  sockets = new Set(),
  responses = new Set()
const server = createServer((request, response) => {
  requests.push(request.url)
  response.setHeader('access-control-allow-origin', '*')
  if (request.url === '/recovery') {
    response.end('released')
    return
  }
  assert.equal(request.url, '/held')
  held = true
  responses.add(response)
  response.once('close', () => responses.delete(response))
  changed.emit('change')
})
server.on('connection', (socket) => {
  sockets.add(socket)
  socket.once('close', () => sockets.delete(socket))
})
function wait(predicate, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => finish(new Error(label + ' timed out\n' + human + '\n' + errors)),
      60000
    )
    function finish(error) {
      clearTimeout(timer)
      changed.removeListener('change', check)
      error ? reject(error) : resolve()
    }
    function check() {
      try {
        if (failure) finish(failure)
        else if (predicate()) finish()
        else if (runClosed) finish(new Error(label + ': watch closed'))
      } catch (error) {
        finish(error)
      }
    }
    changed.on('change', check)
    check()
  })
}
const read = () => JSON.parse(fs.readFileSync(reportFile, 'utf8'))
const caseRows = (report) =>
  report.testResults
    .flatMap((file) =>
      file.assertionResults.map((test) => ({
        file: path.basename(file.name),
        name: test.fullName,
        status: test.status,
        failureMessages: test.failureMessages,
      }))
    )
    .sort((a, b) => a.file.localeCompare(b.file))
const outputRows = (report) =>
  report.next.events
    .filter((event) => event.type === 'output')
    .map((event) => ({
      file: event.entryId.slice(event.entryId.indexOf(':') + 1),
      stream: event.stream,
      text: event.text.replace(/\n$/, ''),
    }))
const deadline = setTimeout(
  () => signal.abort(new Error('Browser watch matrix deadline')),
  150000
)
;(async () => {
  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const origin = 'http://127.0.0.1:' + server.address().port
    for (const name of [
      'a-complete.case.mjs',
      'z-active.case.mjs',
      'subject.mjs',
      'package.json',
      'app/layout.jsx',
      'app/page.jsx',
    ]) {
      const target = path.join(fixture, name)
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(
        target,
        fs
          .readFileSync(path.join(source, name + '.txt'), 'utf8')
          .replace('__NEXT_TEST_CONTROL_ORIGIN__', JSON.stringify(origin))
      )
    }
    fs.writeFileSync(
      path.join(fixture, 'next.config.mjs'),
      'export default ' + JSON.stringify({ turbopack: { root } }) + '\n'
    )
    const browser = {
      enabled: true,
      instances: [{ browser: engine }],
      ...(headless === undefined ? {} : { headless: headless === 'true' }),
    }
    fs.writeFileSync(
      path.join(fixture, 'next.test.config.json'),
      JSON.stringify({
        maxWorkers: 2,
        projects: [
          ...(kind === 'multi'
            ? [
                {
                  name: 'early',
                  mode,
                  include: ['a-complete.case.mjs'],
                  browser,
                },
              ]
            : []),
          { name: 'active', mode, include: ['z-active.case.mjs'], browser },
        ],
      }) + '\n'
    )
    run = watchTests(fixture, {
      signal: signal.signal,
      input,
      output: terminal,
      apiPort: 0,
      resultReporters: ['default', 'json'],
      outputFile: reportFile,
      reporter: { isTTY: true, color: false },
      write(text) {
        human += text
        changed.emit('change')
      },
      writeError(text) {
        errors += text
        changed.emit('change')
      },
      onEvent(event) {
        events.push(event)
        changed.emit('change')
      },
    }).then(
      (value) => {
        runClosed = true
        changed.emit('change')
        return value
      },
      (error) => {
        failure = error
        runClosed = true
        changed.emit('change')
        throw error
      }
    )
    void run.catch(() => {})
    const apiURL = () =>
      /Next test discovery API: (http:\/\/127\.0\.0\.1:\d+\/v1\/discovery)/.exec(
        errors
      )?.[1]
    await wait(
      () =>
        held &&
        apiURL() &&
        events.some(
          (event) =>
            event.type === 'case-start' &&
            event.name === 'active owned HTTP body'
        ) &&
        (kind !== 'multi' ||
          events.some(
            (event) =>
              event.type === 'file-end' &&
              event.entryId.endsWith(':a-complete.case.mjs') &&
              event.status === 'passed'
          )),
      'actual owned active request and prior completion'
    )
    const before = await fetch(apiURL(), {
      signal: AbortSignal.timeout(5000),
    }).then((response) => response.json())
    assert.equal(before.run.status, 'running')
    assert.ok(
      before.cases.some(
        (test) =>
          test.name === 'active owned HTTP body' && test.status === 'running'
      )
    )
    if (method === 'api') {
      const response = await fetch(
        new URL(
          '/v1/runs/' + encodeURIComponent(before.run.id) + '/cancel',
          apiURL()
        ),
        { method: 'POST', signal: AbortSignal.timeout(5000) }
      )
      assert.equal(response.status, 202)
      await response.json()
    } else input.write('c')
    await wait(
      () =>
        human.includes('Test run cancelled. Watching for file changes...') &&
        fs.existsSync(reportFile),
      'closed cancellation report'
    )
    const cancelled = read()
    const expectedCancelled = [
      ...(kind === 'multi'
        ? [
            {
              file: 'a-complete.case.mjs',
              name: 'earlier completed file',
              status: 'passed',
              failureMessages: [],
            },
          ]
        : []),
      {
        file: 'z-active.case.mjs',
        name: 'active owned HTTP body',
        status: 'skipped',
        failureMessages: [],
      },
    ]
    assert.equal(cancelled.success, true)
    assert.deepEqual(caseRows(cancelled), expectedCancelled)
    assert.equal(responses.size, 0)
    let recovered
    if (kind === 'single') {
      const ready = (human.match(/Waiting for file changes\.\.\./g) || [])
        .length
      fs.writeFileSync(
        path.join(fixture, 'subject.mjs'),
        "export const gate='recovery'\n"
      )
      await wait(
        () =>
          (human.match(/Waiting for file changes\.\.\./g) || []).length > ready,
        'fresh real source recovery'
      )
      recovered = read()
      assert.equal(recovered.success, true)
      assert.deepEqual(caseRows(recovered), [
        {
          file: 'z-active.case.mjs',
          name: 'active owned HTTP body',
          status: 'passed',
          failureMessages: [],
        },
      ])
    }
    const current = recovered || cancelled
    const settled = await fetch(apiURL(), {
      signal: AbortSignal.timeout(5000),
    }).then((response) => response.json())
    const late = await fetch(
      new URL(
        '/v1/runs/' + encodeURIComponent(settled.run.id) + '/cancel',
        apiURL()
      ),
      { method: 'POST', signal: AbortSignal.timeout(5000) }
    )
    assert.equal(late.status, 409)
    await late.json()
    const locked = JSON.stringify(current)
    // This observation window checks that a refused late request cannot rewrite results.
    await delay(200)
    assert.equal(JSON.stringify(read()), locked)
    assert.equal(locked.includes('closedUserCancellation'), false)
    const actualRows = [
      ...outputRows(cancelled),
      ...(recovered ? outputRows(recovered) : []),
    ]
    assert.deepEqual(
      actualRows.filter((row) => row.file === 'a-complete.case.mjs'),
      kind === 'multi'
        ? [
            {
              file: 'a-complete.case.mjs',
              stream: 'stdout',
              text: 'EARLY_DONE',
            },
          ]
        : []
    )
    assert.deepEqual(
      actualRows.filter((row) => row.file === 'z-active.case.mjs'),
      [
        'ACTIVE_FETCH_START held',
        ...(recovered
          ? ['ACTIVE_FETCH_START recovery', 'ACTIVE_FETCH_END recovery']
          : []),
      ].map((text) => ({ file: 'z-active.case.mjs', stream: 'stdout', text }))
    )
    assert.ok(
      actualRows.every((row) =>
        ['a-complete.case.mjs', 'z-active.case.mjs'].includes(row.file)
      )
    )
    let configurationReload
    if (headless !== undefined && kind === 'single') {
      const ready = (human.match(/Waiting for file changes\.\.\./g) || [])
        .length
      const configPath = path.join(fixture, 'next.test.config.json')
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
      config.projects[0].browser.headless = headless !== 'true'
      fs.writeFileSync(configPath, JSON.stringify(config) + '\n')
      await wait(
        () =>
          (human.match(/Waiting for file changes\.\.\./g) || []).length > ready,
        'actual browser headless configuration reload'
      )
      const report = read()
      assert.equal(report.success, true)
      assert.deepEqual(caseRows(report), caseRows(recovered))
      const rows = outputRows(report)
      assert.deepEqual(
        rows,
        ['ACTIVE_FETCH_START recovery', 'ACTIVE_FETCH_END recovery'].map(
          (text) => ({ file: 'z-active.case.mjs', stream: 'stdout', text })
        )
      )
      configurationReload = {
        headless: headless !== 'true',
        cases: caseRows(report),
        rows,
      }
    }
    input.write('q')
    assert.deepEqual(await run, { status: 'failed' })
    assert.equal(input.isRaw, false)
    assert.equal(responses.size, 0)
    process.stdout.write(
      JSON.stringify({
        mode,
        ...(headless === undefined ? {} : { headless: headless === 'true' }),
        engine,
        method,
        kind,
        cases: caseRows(cancelled),
        recovery: recovered ? caseRows(recovered) : undefined,
        rows: actualRows,
        actualRequests: requests,
        lateStatus: 409,
        expectedWatchExit: 'failed',
        allWatchOwnersClosed: true,
        ...(configurationReload ? { configurationReload } : {}),
      }) + '\n'
    )
  } finally {
    clearTimeout(deadline)
    signal.abort()
    await run?.catch(() => {})
    for (const socket of sockets) socket.destroy()
    await new Promise((resolve) => server.close(resolve))
    input.destroy()
    terminal.destroy()
    fs.rmSync(fixture, { recursive: true, force: true })
    fs.rmSync(output, { recursive: true, force: true })
  }
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
