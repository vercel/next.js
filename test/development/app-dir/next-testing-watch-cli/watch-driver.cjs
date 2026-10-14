const assert = require('node:assert/strict')
const { readFile, writeFile, readdir } = require('node:fs/promises')
const { readFileSync } = require('node:fs')
const { dirname, join } = require('node:path')
const { pathToFileURL } = require('node:url')
const runPublicProcess = require('./public-process.cjs')
const {
  watchTests,
} = require('next/dist/experimental/testing/watch-orchestrator')

async function main() {
  const projectDir = process.cwd()
  const requestedMode = process.argv[2]
  const publicCli = requestedMode.startsWith('public-')
  const mode = publicCli ? 'reload' : requestedMode
  const testConfigPath = join(projectDir, 'next.test.config.json')
  const originalTestConfig = await readFile(testConfigPath, 'utf8')
  if (publicCli) {
    const config = JSON.parse(originalTestConfig)
    config.projects[0].environment = requestedMode.slice('public-'.length)
    await writeFile(testConfigPath, JSON.stringify(config))
  }
  const configPath = join(projectDir, 'next.config.js')
  const setupPath = join(projectDir, 'setup.ts')
  const originalConfig = await readFile(configPath, 'utf8')
  const originalSetup = await readFile(setupPath, 'utf8')
  const specPath = join(projectDir, 'specs/subject.ts')
  const originalSpec = await readFile(specPath, 'utf8')
  if (requestedMode === 'public-rsc')
    await writeFile(specPath, `import 'server-only'\n${originalSpec}`)
  await writeFile(
    join(projectDir, '.env.local'),
    'NEXT_TEST_WATCH_VALUE=first\n'
  )
  const controller = new AbortController()
  const deadline = setTimeout(
    () => controller.abort(new Error('Watch integration deadline')),
    60000
  )
  let output = ''
  let mutation = Promise.resolve()
  let mutated = false
  let killed = false
  let completedSecond = false
  const passed = new Set()
  let cliPid
  const events = []
  const eventLog = join(
    dirname(process.env.NEXT_TEST_NATIVE_AUDIT),
    `${requestedMode}-events.jsonl`
  )
  let observedEvents = 0
  function consumePublicEvents() {
    let source
    try {
      source = readFileSync(eventLog, 'utf8')
    } catch (error) {
      if (error.code === 'ENOENT') return
      throw error
    }
    const lines = source.split('\n')
    lines.pop() // A writer may still be appending the final record.
    for (; observedEvents < lines.length; observedEvents++)
      onEvent(JSON.parse(lines[observedEvents]))
  }
  function onEvent(event) {
    events.push(event)
    if (
      mode !== 'reload' ||
      event.type !== 'run-end' ||
      event.status !== 'passed'
    )
      return
    const completed = events.filter(
      (item) =>
        item.runId === event.runId &&
        item.type === 'case-end' &&
        item.status === 'passed'
    )
    assert.equal(
      completed.length,
      1,
      'A passing generation must include its actual fixture case'
    )
    const match = /^fresh (first|second)$/.exec(completed[0].name)
    assert(
      match,
      'Passing generation must retain the expected fixture case identity'
    )
    passed.add(match[1])
    if (match[1] === 'first' && !mutated) {
      mutated = true
      mutation = (async () => {
        await writeFile(
          configPath,
          originalConfig.replaceAll('first', 'second')
        )
        await writeFile(
          join(projectDir, '.env.local'),
          'NEXT_TEST_WATCH_VALUE=second\n'
        )
        await writeFile(setupPath, originalSetup.replaceAll('first', 'second'))
      })().catch((error) => controller.abort(error))
    } else if (match[1] === 'second') {
      completedSecond = true
      controller.abort(new Error('Verified fresh configuration and setup'))
    }
  }
  async function runPublicWatch(_projectDir, options) {
    await writeFile(eventLog, '')
    const result = await runPublicProcess(
      [require.resolve('next/dist/bin/next'), 'test', projectDir, '--watch'],
      {
        ...options,
        cwd: projectDir,
        env: {
          ...process.env,
          NODE_OPTIONS: [
            process.env.NODE_OPTIONS,
            `--import=${JSON.stringify(pathToFileURL(process.argv[3]).href)}`,
          ]
            .filter(Boolean)
            .join(' '),
          NEXT_TEST_EVENT_AUDIT: eventLog,
        },
        getOwnedPids() {
          return [
            ...audit().map((item) => item.pid),
            ...[...output.matchAll(/WATCH_(?:FILE|LOADER)_PID=(\d+)/g)].map(
              (match) => Number(match[1])
            ),
          ]
        },
      }
    )
    consumePublicEvents()
    cliPid = result.pid
    return { status: 'cancelled' }
  }

  function audit() {
    let source
    try {
      source = readFileSync(process.env.NEXT_TEST_NATIVE_AUDIT, 'utf8')
    } catch (error) {
      if (error.code === 'ENOENT') return []
      throw error
    }
    return source.trim().split('\n').filter(Boolean).map(JSON.parse)
  }
  try {
    const result = await (publicCli ? runPublicWatch : watchTests)(projectDir, {
      signal: controller.signal,
      onEvent,
      write(text) {
        output += text
        if (publicCli) consumePublicEvents()
        if (
          mode === 'crash' &&
          text.includes('WATCH_FILE_STARTED') &&
          !killed
        ) {
          const coordinator = audit()
            .filter((item) => item.process === 'watch-worker.js')
            .at(-1)
          assert.ok(coordinator, 'Actual compiler coordinator PID was audited')
          killed = true
          process.kill(coordinator.pid, 'SIGKILL')
        }
      },
    })
    await mutation
    if (mode === 'reload') {
      assert.equal(result.status, 'cancelled')
      assert.equal(completedSecond, true, output)
      assert.deepEqual([...passed].sort(), ['first', 'second'])
    } else {
      assert.equal(killed, true, output)
      assert.equal(result.status, 'failed', output)
      const completed = events.filter((event) => event.type === 'run-end')
      assert(
        completed.some((event) => event.status === 'failed'),
        'Crash must produce a failed terminal result'
      )
      assert(
        completed.every((event) => event.status !== 'passed'),
        'Crash must not certify a passing run'
      )
    }
    const natives = audit()
    assert.ok(natives.length, 'Actual compiler native loads recorded')
    const pids = new Set(natives.map((item) => item.pid))
    if (cliPid) pids.add(cliPid)
    for (const match of output.matchAll(/WATCH_(?:FILE|LOADER)_PID=(\d+)/g))
      pids.add(Number(match[1]))
    for (const pid of pids) {
      assert.throws(
        () => process.kill(pid, 0),
        { code: 'ESRCH' },
        `Managed process ${pid} survived`
      )
    }
    for (const root of ['.watch-output-first', '.watch-output-second']) {
      const files = await readdir(join(projectDir, root)).catch((error) => {
        if (error.code === 'ENOENT') return []
        throw error
      })
      assert.equal(
        files.some((file) => file.startsWith('.next-test-')),
        false,
        `Orphan artifact in ${root}`
      )
    }
    return {
      mode: requestedMode,
      result,
      passed: [...passed],
      pids: [...pids],
      natives,
      events,
      output,
    }
  } finally {
    clearTimeout(deadline)
    controller.abort()
    await mutation
    await writeFile(configPath, originalConfig)
    await writeFile(setupPath, originalSetup)
    await writeFile(specPath, originalSpec)
    await writeFile(testConfigPath, originalTestConfig)
  }
}

main()
  .then((result) =>
    console.log('NEXT_TEST_WATCH_RESULT=' + JSON.stringify(result))
  )
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
