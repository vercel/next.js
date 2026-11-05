'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const childProcess = require('node:child_process')
const { createRequire } = Module
const output = path.resolve(process.argv[2])
const role = process.argv[3]
const passing = process.argv[4] === 'true'
assert(['true', 'false'].includes(process.argv[4]))
const dist =
  process.argv[5] ||
  path.join(path.dirname(require.resolve('next/package.json')), 'dist')
const ts = require(process.argv[6] || 'typescript')
const cliFile = path.join(dist, 'cli/next-test-runner.js')
const orchestratorFile = path.join(dist, 'experimental/testing/orchestrator.js')
const fixture = path.join(output, 'fixture')
const traceFile = path.join(output, 'trace.jsonl')
const reportFile = path.join(output, 'report.json')
const fixtures = path.join(__dirname, 'empty-selection-fixtures')
const reporterFile = path.join(fixture, 'reporter.mjs')
fs.mkdirSync(fixture, { recursive: true })
for (const name of ['reporter.mjs', 'global-setup.mjs', 'spec.test.mjs'])
  fs.copyFileSync(path.join(fixtures, name + '.txt'), path.join(fixture, name))
process.env.EMPTY_TRACE = traceFile
process.env.EMPTY_MODE = role
process.env.NEXT_TEST_EMPTY_GUARD_AUDIT = path.join(output, 'runtime-guard')
const guardFile = path.join(__dirname, 'empty-selection-runtime-guard.cjs')
process.env.NODE_OPTIONS =
  '--require=' +
  JSON.stringify(guardFile) +
  (process.env.NODE_OPTIONS ? ' ' + process.env.NODE_OPTIONS : '')
const guard = require(guardFile)
const runtimeRequire = createRequire(cliFile)
const actualConfig = runtimeRequire('../experimental/testing/config')
const actualScheduling = runtimeRequire('../experimental/testing/scheduling')
const actualMachine = runtimeRequire(
  '../experimental/testing/reporting/machine'
)
const calls = []
const events = []
const children = []
const joins = []
const configuration = {
  config: actualConfig.normalizeTestConfig(
    JSON.parse(
      fs.readFileSync(path.join(fixtures, 'config-' + passing + '.json'))
    )
  ),
  compilerTransformNames: [],
  watchInputs: [],
  hasSnapshotPathResolver: false,
  compilerInputsForProjects() {
    calls.push('compiler-input-selection')
    return []
  },
  async setup(projects) {
    calls.push({ setupSelected: projects.length })
    assert.deepEqual(projects, [])
  },
  async dispose() {
    if (!calls.includes('config-dispose')) calls.push('config-dispose')
  },
}
const configurationError = new Error('actual configuration evaluation sentinel')
const discoveryError = new Error('actual discovery configuration sentinel')
const sinkError = new Error('actual no-tests output delivery sentinel')
const originalFork = childProcess.fork
childProcess.fork = function (worker, args, options) {
  assert.equal(
    path.resolve(worker),
    path.join(dist, 'experimental/testing/reporting/custom-reporter-worker.js')
  )
  const child = Reflect.apply(originalFork, this, [worker, args, options])
  const receipt = { pid: child.pid, joined: false }
  children.push(receipt)
  joins.push(
    new Promise((resolve) =>
      child.once('close', (code, signal) => {
        Object.assign(receipt, { joined: true, code, signal })
        resolve()
      })
    )
  )
  return child
}
function selectedModule(file, overrides) {
  const selected = new Module(file)
  selected.filename = file
  selected.paths = Module._nodeModulePaths(path.dirname(file))
  const ordinary = createRequire(file)
  selected.require = (request) => overrides?.(request) ?? ordinary(request)
  const result = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    fileName: file,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
    reportDiagnostics: true,
  })
  assert(
    !result.diagnostics.some(
      (item) => item.category === ts.DiagnosticCategory.Error
    )
  )
  selected._compile(result.outputText, file)
  return selected.exports
}
let orchestrator
const cli = selectedModule(cliFile, (request) => {
  if (request === '../experimental/testing/config')
    return {
      ...actualConfig,
      async openTestConfiguration() {
        calls.push('config-open')
        if (role === 'config-error') throw configurationError
        return configuration
      },
    }
  if (request === '../experimental/testing/discovery')
    return {
      async discoverTests(root, config, options) {
        calls.push({ discovery: { root, options } })
        if (role === 'discovery-error') throw discoveryError
        return config.projects.map((project) => ({ ...project, entries: [] }))
      },
    }
  if (request === '../experimental/testing/scheduling')
    return {
      ...actualScheduling,
      async acquireTestRunLock() {
        calls.push('lock-acquired')
        return {
          async unlock() {
            calls.push('lock-released')
          },
        }
      },
    }
  if (request === '../experimental/testing/reporting/machine')
    return {
      ...actualMachine,
      createMachineReporter(options) {
        const machine = actualMachine.createMachineReporter(options)
        const onEvent = machine.onEvent
        machine.onEvent = (event) => {
          events.push(structuredClone(event))
          if (role === 'policy-output-sink' && event.type === 'output')
            throw sinkError
          return Reflect.apply(onEvent, machine, [event])
        }
        return machine
      },
    }
  if (request === '../experimental/testing/orchestrator.js') {
    orchestrator ??= selectedModule(orchestratorFile)
    return {
      ...orchestrator,
      async runTests(root, projects, options) {
        calls.push('actual-run-tests')
        assert(projects.every((project) => project.entries.length === 0))
        assert.equal(options.execute, undefined)
        assert.equal(options.allocateArtifact, undefined)
        const actual = await orchestrator.runTests(root, projects, options)
        result.summary = structuredClone(actual)
        return actual
      },
    }
  }
})
const previousExitCode = process.exitCode
const previousInterrupts = process.listeners('SIGINT')
const previousTerms = process.listeners('SIGTERM')
const result = { role, passing, node: process.version, calls, events, children }
async function joinOwnedChildren() {
  for (const child of children) {
    if (child.joined) continue
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch (error) {
      if (error.code !== 'ESRCH') throw error
    }
  }
  await Promise.all(joins)
}
const deadline = setTimeout(() => {
  void joinOwnedChildren().finally(() => {
    fs.writeFileSync(path.join(output, 'TIMEOUT.json'), JSON.stringify(result))
    process.exit(124)
  })
}, 15000)
;(async () => {
  let thrown
  let failed = false
  try {
    await cli.nextTestRunner(
      role === 'invalid-root' ? path.join(fixture, 'missing-root') : fixture,
      role === 'listing'
        ? { list: true, filter: ['missing'] }
        : {
            run: true,
            reporter: [reporterFile, 'json'],
            outputFile: reportFile,
            filter: role === 'filtered' ? ['missing'] : undefined,
          }
    )
  } catch (error) {
    failed = true
    thrown = error
  }
  result.cliExitCode = process.exitCode
  result.failed = failed
  result.error = failed
    ? { name: thrown?.name, message: thrown?.message, code: thrown?.code }
    : undefined
  result.trace = fs.existsSync(traceFile)
    ? fs
        .readFileSync(traceFile, 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(JSON.parse)
    : []
  result.report = fs.existsSync(reportFile)
    ? JSON.parse(fs.readFileSync(reportFile))
    : undefined
  assert.deepEqual(process.listeners('SIGINT'), previousInterrupts)
  assert.deepEqual(process.listeners('SIGTERM'), previousTerms)
  assert.equal(guard.blocked.length, 0)
  for (const child of children) {
    assert(child.joined)
    let absent = false
    try {
      process.kill(-child.pid, 0)
    } catch (error) {
      absent = error.code === 'ESRCH'
    }
    assert(absent)
    child.groupAbsent = true
    const audit = JSON.parse(
      fs.readFileSync(path.join(output, 'runtime-guard', child.pid + '.json'))
    )
    assert.deepEqual(audit.blocked, [])
  }
  assert(!events.some((event) => /^(?:file|case|suite)-/.test(event.type)))
  assert(!events.some((event) => event.type === 'diagnostic'))
  if (role === 'config-error' || role === 'discovery-error') {
    assert.equal(
      thrown,
      role === 'config-error' ? configurationError : discoveryError
    )
    assert.deepEqual(result.trace, [])
    assert.equal(children.length, 0)
  } else if (role === 'invalid-root') {
    assert.equal(thrown.code, 'ENOENT')
    assert.deepEqual(calls, [])
    assert.equal(children.length, 0)
  } else if (role === 'listing') {
    assert(!passing)
    assert.match(thrown.message, /No test files matched/)
    assert.deepEqual(result.trace, [])
    assert.equal(children.length, 0)
  } else if (role === 'policy-output-sink') {
    assert.equal(thrown, sinkError)
    assert.deepEqual(
      events.map((event) => event.type),
      ['run-start', 'output']
    )
    assert.equal(result.report, undefined)
    assert.deepEqual(
      result.trace.map((row) => row.kind),
      ['init', 'get-start', 'start', 'close']
    )
  } else if (role.startsWith('start-') || role.startsWith('end-')) {
    assert(failed)
    assert.match(
      thrown.message,
      /empty (?:start|end) (?:getter|throw|rejection) sentinel/
    )
    assert.equal(result.trace.at(-1).kind, 'close')
    if (role.startsWith('start-')) {
      assert.deepEqual(events, [])
      assert(!result.trace.some((row) => row.kind === 'end'))
      assert.equal(result.report, undefined)
    } else assert.equal(result.report !== undefined, role === 'end-reject')
  } else {
    assert(!failed, thrown?.stack)
    assert.equal(result.cliExitCode, passing ? undefined : 1)
    assert.deepEqual(
      events.map((event) => event.type),
      passing ? ['run-start', 'run-end'] : ['run-start', 'output', 'run-end']
    )
    assert.equal(events.at(-1).status, passing ? 'passed' : 'failed')
    if (!passing)
      assert.deepEqual(
        Object.fromEntries(
          ['type', 'stream', 'text'].map((key) => [key, events[1][key]])
        ),
        { type: 'output', stream: 'stderr', text: 'No test files selected.\n' }
      )
    assert.deepEqual(
      result.trace.map((row) => row.kind),
      ['init', 'get-start', 'start', 'get-end', 'end', 'close']
    )
    assert.deepEqual(result.trace[2], {
      kind: 'start',
      argc: 1,
      receiver: true,
      specifications: [],
    })
    assert.deepEqual(result.trace[4], {
      kind: 'end',
      argc: 3,
      receiver: true,
      modules: [],
      errors: [],
      reason: passing ? 'passed' : 'failed',
    })
    assert.equal(result.report.success, passing)
    assert.deepEqual(result.report.testResults, [])
    for (const field of [
      'numTotalTestSuites',
      'numPassedTestSuites',
      'numFailedTestSuites',
      'numPendingTestSuites',
      'numTotalTests',
      'numPassedTests',
      'numFailedTests',
      'numPendingTests',
      'numTodoTests',
    ])
      assert.equal(result.report[field], 0, field)
    assert.equal(result.report.snapshot.total, 0)
    assert.equal(result.report.snapshot.failure, false)
    assert.equal(typeof result.report.startTime, 'number')
    assert(result.report.startTime > 0)
    assert.equal(result.summary.status, passing ? 'passed' : 'failed')
    for (const field of ['files', 'cases'])
      assert.deepEqual(result.summary[field], {
        passed: 0,
        failed: 0,
        skipped: 0,
        cancelled: 0,
      })
    assert.deepEqual(
      calls.filter(
        (call) => call && typeof call === 'object' && 'setupSelected' in call
      ),
      [{ setupSelected: 0 }]
    )
    assert.equal(children.length, 1)
    assert.deepEqual(
      children.map((child) => [child.code, child.signal]),
      [[0, null]]
    )
  }
  result.nativeCompilerOrExecutionAttempts = 0
  result.success = true
  fs.writeFileSync(
    path.join(output, 'VERIFIED.json'),
    JSON.stringify(result, null, 2) + '\n'
  )
})()
  .catch((error) => {
    fs.writeFileSync(
      path.join(output, 'FAILED.json'),
      JSON.stringify(
        {
          ...result,
          verificationError: {
            name: error.name,
            message: error.message,
            stack: error.stack,
          },
        },
        null,
        2
      ) + '\n'
    )
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    clearTimeout(deadline)
    await joinOwnedChildren()
    childProcess.fork = originalFork
    if (result.success) process.exitCode = previousExitCode
  })
