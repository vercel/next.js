import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { hostname, tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const [output, installedConsumer] = process.argv.slice(2)
const local = dirname(fileURLToPath(import.meta.url))
const consumer = installedConsumer ?? resolve(local, '../../..')
const require = createRequire(join(consumer, 'package.json'))
const sourceRequire = createRequire(import.meta.url)
const parserRequire = createRequire(
  sourceRequire.resolve('jest-environment-jsdom')
)
const { SaxesParser } = parserRequire('saxes')
require('next/dist/server/node-environment-baseline')
const {
  createMachineReporter,
} = require('next/dist/experimental/testing/reporting/machine')
if (installedConsumer)
  for (const name of ['vitest', 'vite', '@vitest/mocker'])
    assert.throws(() => require.resolve(name), { code: 'MODULE_NOT_FOUND' })
const projectDir = mkdtempSync(join(tmpdir(), 'next-junit-metadata-'))
const files = ['first.case.mjs', 'nested & directory/second.case.mjs']
const entries = files.map((file, index) => ({
  id: 'owned-' + index,
  file: join(projectDir, file),
  profile: {
    id: 'actual-profile',
    mode: 'development',
    environment: 'node',
    runtime: 'nodejs',
    bundler: 'turbopack',
  },
}))
const envelope = {
  version: 1,
  runId: 'original',
  revision: 'revision',
  timestamp: 100,
}
function fill(machine) {
  machine.onEvent({ ...envelope, type: 'run-start' })
  for (const entry of entries) {
    machine.onEvent({ ...envelope, type: 'file-start', entry })
    machine.onEvent({
      ...envelope,
      type: 'case-end',
      entryId: entry.id,
      caseId: entry.id + ':body',
      attempt: { id: entry.id + ':attempt', retry: 0, repeat: 0 },
      name: 'body',
      status: 'passed',
      durationMs: 12,
      errors: [],
    })
    machine.onEvent({
      ...envelope,
      type: 'file-end',
      entryId: entry.id,
      status: 'passed',
      durationMs: 123,
    })
  }
  machine.onEvent({
    ...envelope,
    type: 'run-end',
    status: 'passed',
    durationMs: 246,
  })
}
function parse(xml) {
  const suites = []
  const parser = new SaxesParser()
  parser.on('opentag', ({ name, attributes }) => {
    if (name === 'testsuite') suites.push(attributes)
  })
  parser.write(xml).close()
  return suites
}
function captureRender(machine) {
  const ActualDate = globalThis.Date
  const constructors = []
  const DateObserver = new Proxy(ActualDate, {
    construct(target, args, newTarget) {
      const value = Reflect.construct(target, args, newTarget)
      if (!args.length) constructors.push(value.toISOString())
      return value
    },
  })
  let xml
  try {
    globalThis.Date = DateObserver
    xml = machine.getJUnit()
  } finally {
    globalThis.Date = ActualDate
  }
  return { xml, constructors }
}
function check(rendered, names = files) {
  const suites = parse(rendered.xml)
  assert.deepEqual(
    suites.map((suite) => suite.name),
    names
  )
  assert.equal(rendered.constructors.length, suites.length)
  for (const [index, suite] of suites.entries()) {
    assert.equal(suite.timestamp, rendered.constructors[index])
    assert.equal(suite.hostname, hostname())
    assert.notEqual(Date.parse(suite.timestamp), envelope.timestamp)
    assert.equal(suite.tests, '1')
    assert.equal(suite.time, '0.123')
  }
  return suites
}
const machines = []
try {
  const machine = createMachineReporter({
    projectDir,
    reporters: ['junit'],
    write() {},
  })
  machines.push(machine)
  fill(machine)
  const before = JSON.stringify(machine.getJson())
  check(captureRender(machine))
  assert.equal(JSON.stringify(machine.getJson()), before)
  const records = machine.snapshotClosedFiles(
    new Set(entries.map((entry) => entry.id))
  )
  const retained = createMachineReporter({
    projectDir,
    reporters: ['json', 'junit'],
    write() {},
  })
  machines.push(retained)
  retained.onEvent({
    ...envelope,
    runId: 'current',
    type: 'run-start',
    timestamp: 999,
  })
  retained.retainUnexecutedFiles(
    entries,
    records,
    entries.map((entry) => entry.id)
  )
  retained.onEvent({
    ...envelope,
    runId: 'current',
    type: 'run-end',
    timestamp: 999,
    status: 'passed',
    durationMs: 0,
  })
  const evidence = JSON.stringify(records)
  check(captureRender(retained))
  assert.equal(JSON.stringify(records), evidence)
  for (const reporters of [
    ['junit'],
    ['json', 'junit'],
    ['default', 'junit'],
  ]) {
    const writes = []
    const active = createMachineReporter({
      projectDir,
      reporters,
      write(text) {
        writes.push(text)
      },
    })
    machines.push(active)
    fill(active)
    await active.finish()
    const xml = writes.find((text) => text.startsWith('<?xml'))
    assert(xml)
    assert.deepEqual(
      parse(xml).map((suite) => [suite.name, suite.hostname]),
      files.map((file) => [file, hostname()])
    )
  }
  const noFiles = createMachineReporter({
    projectDir,
    reporters: ['junit'],
    write() {},
  })
  machines.push(noFiles)
  noFiles.onEvent({ ...envelope, type: 'run-start' })
  noFiles.onEvent({
    ...envelope,
    type: 'run-end',
    status: 'passed',
    durationMs: 0,
  })
  assert.deepEqual(captureRender(noFiles), {
    xml: '<?xml version="1.0" encoding="UTF-8"?>\n<testsuites></testsuites>\n',
    constructors: [],
  })
  const runError = createMachineReporter({
    projectDir,
    reporters: ['junit'],
    write() {},
  })
  machines.push(runError)
  runError.onEvent({ ...envelope, type: 'run-start' })
  runError.onEvent({
    ...envelope,
    type: 'diagnostic',
    diagnostic: { severity: 'error', message: 'actual run error' },
  })
  runError.onEvent({
    ...envelope,
    type: 'run-end',
    status: 'failed',
    durationMs: 0,
  })
  const runRendered = captureRender(runError)
  assert.deepEqual(
    parse(runRendered.xml).map((suite) => suite.name),
    ['[run errors]']
  )
  assert.deepEqual(runRendered.constructors, [])
  writeFileSync(
    output,
    JSON.stringify(
      {
        metadataControls: 7,
        actualRenderClockObserved: true,
        currentAndRetainedPathsExact: true,
        physicalEvidenceUnchanged: true,
        mixedSinkMetadataExact: true,
        emptyAndRunErrorBytesHeld: true,
        durationAndCountsNotChanged: true,
        sdkAbsent: !!installedConsumer,
        version: process.version,
        versions: process.versions,
        execPath: process.execPath,
      },
      null,
      2
    ) + '\n'
  )
} finally {
  for (const machine of machines) await machine.dispose()
  rmSync(projectDir, { recursive: true, force: true })
}
