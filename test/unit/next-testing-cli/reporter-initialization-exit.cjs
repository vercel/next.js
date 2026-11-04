const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const cp = require('node:child_process')

function assertObservation(observed) {
  const { scenario, nativeExit, phases } = observed
  const initial =
    scenario.initial === 'undefined' ? undefined : scenario.initial
  const initializedFailure = [
    'oninit',
    'partial',
    'async',
    'throwundefined',
  ].includes(scenario.kind)
  const expectedCode = scenario.noFinalOwner
    ? 0
    : scenario.kind === 'success'
      ? (initial ?? 0)
      : scenario.kind === 'constructor'
        ? (initial ?? 1)
        : scenario.close === 'none'
          ? 1
          : scenario.close === 'undefined'
            ? 0
            : scenario.close
  assert.deepEqual(nativeExit, {
    reason: 'exit',
    code: expectedCode,
    signal: null,
  })
  assert.equal(observed.bodyExecuted, false)
  assert.equal(observed.reportProduced, false)
  assert.equal(observed.allObservedChildrenAndStreamsJoined, true)
  assert.equal(observed.remainingOwnedConfigurationGroups, 0)
  assert.equal(observed.noFakeFinalizer, true)
  if (initializedFailure && scenario.close !== 'none') {
    const close = phases.find((row) => row.phase === 'close-before')
    assert.ok(close)
    const expected = scenario.noFinalOwner ? initial : 1
    assert.deepEqual(close.exitCode, {
      type: typeof expected,
      ...(expected === undefined ? {} : { value: expected }),
    })
  }
  const authoredError = phases.find((row) => row.phase === 'authored-error')
  if (authoredError) {
    assert.deepEqual(observed.error, {
      name: authoredError.name,
      message: authoredError.message,
      stack: authoredError.stack,
    })
  }
}
module.exports = { assertObservation }

if (require.main === module) {
  const [kind, initialArgument, closeArgument] = process.argv.slice(2)
  assert.ok(
    [
      'constructor',
      'oninit',
      'partial',
      'async',
      'throwundefined',
      'success',
      'nonfinal',
    ].includes(kind)
  )
  const scenario = {
    kind: kind === 'nonfinal' ? 'oninit' : kind,
    initial:
      initialArgument === 'undefined'
        ? initialArgument
        : Number(initialArgument),
    close: ['none', 'undefined'].includes(closeArgument)
      ? closeArgument
      : Number(closeArgument),
    ...(kind === 'nonfinal' ? { noFinalOwner: true } : {}),
  }
  const dist =
    process.argv[5] ??
    path.join(path.dirname(require.resolve('next/package.json')), 'dist')
  const directory = fs.mkdtempSync(
    path.join(require('node:os').tmpdir(), 'next-reporter-init-exit-')
  )
  const fixture = path.join(__dirname, 'reporter-initialization-exit-fixtures')
  for (const name of fs.readdirSync(fixture))
    fs.copyFileSync(
      path.join(fixture, name),
      path.join(directory, name.replace(/\.txt$/, ''))
    )
  fs.writeFileSync(
    path.join(directory, 'SCENARIO.json'),
    JSON.stringify(scenario)
  )
  const scenarioDir = directory
  const children = [],
    joined = []
  const actualFork = cp.fork
  cp.fork = function (...args) {
    const child = Reflect.apply(actualFork, this, args)
    children.push({ child, detached: args[2]?.detached })
    joined.push(
      new Promise((resolve, reject) => {
        child.once('error', reject)
        child.once('close', (code, signal) =>
          resolve({ pid: child.pid, code, signal })
        )
      })
    )
    return child
  }
  const { openTestConfiguration } = require(
    path.join(dist, 'experimental/testing/config')
  )
  const { openCustomReporters } = require(
    path.join(dist, 'experimental/testing/reporting/custom-reporter')
  )
  let configuration,
    prepared,
    reporter,
    observedError,
    initializationRejected = false
  const controller = new AbortController()
  const watchdog = setTimeout(
    () =>
      controller.abort(
        new Error('Initialization status component failed to join')
      ),
    10000
  )
  function rows() {
    const file = path.join(scenarioDir, 'phase.jsonl')
    return fs.existsSync(file)
      ? fs
          .readFileSync(file, 'utf8')
          .trim()
          .split('\n')
          .filter(Boolean)
          .map(JSON.parse)
      : []
  }
  async function main(scenarioDir, scenario, dist) {
    configuration = await openTestConfiguration(scenarioDir, controller.signal)
    assert.equal(configuration.finalExitOwnerAvailable, true)
    try {
      reporter = await openCustomReporters({
        projectDir: scenarioDir,
        reporters:
          scenario.kind === 'partial'
            ? ['./reporter.mjs', './second.mjs']
            : ['./reporter.mjs'],
        transport: await configuration.openReporterTransport(),
        ...(scenario.noFinalOwner
          ? {}
          : {
              finalExitLifecycle: {
                teardownTimeout: configuration.config.teardownTimeout,
              },
            }),
        signal: controller.signal,
        write: (text) => process.stdout.write(text),
        writeError: (text) => process.stderr.write(text),
      })
    } catch (error) {
      initializationRejected = true
      observedError = error
    }
    assert.equal(initializationRejected, scenario.kind !== 'success')
    if (reporter) await reporter.dispose()
    prepared = await configuration.prepareFinalExit()
    if (scenario.noFinalOwner) assert.equal(prepared, undefined)
    else assert.ok(prepared)
    await configuration.dispose()
    const snapshot = prepared
      ? { value: prepared.exitCode, type: typeof prepared.exitCode }
      : undefined
    const physical = prepared
      ? await prepared.finalize({ kind: 'completed' })
      : await configuration.physicalExit
    configuration = undefined
    const actual = await Promise.all(joined)
    assert.equal(children.length, 1)
    assert.equal(children[0].detached, true)
    assert.ok(actual.every((row) => row.signal === null))
    assert.ok(actual.every((row) => row.code === physical?.code))
    const phases = rows()
    assert.equal(
      phases.some((row) => row.phase === 'body'),
      false
    )
    const original = phases.find((row) => row.phase === 'authored-error')
    if (original) {
      assert.equal(observedError.name, original.name)
      assert.equal(observedError.message, original.message)
      assert.equal(observedError.stack, original.stack)
    }
    for (const { child } of children) {
      let exists = false
      try {
        process.kill(-child.pid, 0)
        exists = true
      } catch (error) {
        if (error.code !== 'ESRCH') throw error
      }
      assert.equal(
        exists,
        false,
        'Owned configuration process group remained after physical join'
      )
    }
    const result = {
      node: process.version,
      scenario,
      nativeExit: physical,
      preparedSnapshot: snapshot,
      phases,
      initializationRejected,
      error: observedError && {
        name: observedError.name,
        message: observedError.message,
        stack: observedError.stack,
      },
      children: actual,
      allObservedChildrenAndStreamsJoined: true,
      remainingOwnedConfigurationGroups: 0,
      noFakeFinalizer: true,
      actualPreparedOwnerUsed: !!prepared,
      bodyExecuted: false,
      reportProduced: fs.existsSync(path.join(scenarioDir, 'cases.json')),
    }
    console.log(JSON.stringify(result))
    assertObservation(result)
  }
  main(directory, scenario, dist)
    .catch((error) => {
      console.error(error)
      process.exitCode = 1
    })
    .finally(async () => {
      clearTimeout(watchdog)
      if (configuration) await configuration.dispose().catch(() => {})
      await Promise.allSettled(joined)
      cp.fork = actualFork
      await require('node:fs/promises').rm(directory, {
        recursive: true,
        force: true,
      })
    })
}
