import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const [output, installedConsumer] = process.argv.slice(2)
const local = dirname(fileURLToPath(import.meta.url))
const require = createRequire(
  join(installedConsumer ?? resolve(local, '../../..'), 'package.json')
)
require('next/dist/server/node-environment-baseline')
const {
  createMachineReporter,
} = require('next/dist/experimental/testing/reporting/machine')
const projectDir = mkdtempSync(join(tmpdir(), 'next-junit-duration-'))
const machines = []
if (installedConsumer)
  for (const name of ['vitest', 'vite', '@vitest/mocker'])
    assert.throws(() => require.resolve(name), { code: 'MODULE_NOT_FOUND' })
const envelope = {
  version: 1,
  runId: 'original',
  revision: 'actual-revision',
  timestamp: 100,
}
const entry = (index) => ({
  id: 'file-' + index,
  file: join(projectDir, 'contract.case.mjs'),
  profile: {
    id: 'node',
    mode: 'development',
    environment: 'node',
    runtime: 'nodejs',
    bundler: 'turbopack',
  },
})
function build({
  roots = [12.345678901234],
  mode = 'run',
  rootStatus = 'passed',
  physicalStatus = 'passed',
  noRoot = false,
  nestedOnly = false,
  noPhysical = false,
  names,
  idOffset = 0,
  outputText,
} = {}) {
  const machine = createMachineReporter({
    projectDir,
    reporters: ['junit'],
    write() {},
  })
  machines.push(machine)
  const entries = roots.map((_, index) => ({
    ...entry(index + idOffset),
    ...(names ? { file: join(projectDir, names[index]) } : {}),
  }))
  machine.onEvent({ ...envelope, type: 'run-start' })
  for (const [index, actual] of entries.entries()) {
    machine.onEvent({ ...envelope, type: 'file-start', entry: actual })
    if (outputText?.[index])
      machine.onEvent({
        ...envelope,
        type: 'output',
        entryId: actual.id,
        stream: 'stdout',
        text: outputText[index],
      })
    machine.onEvent({
      ...envelope,
      type: 'case-end',
      entryId: actual.id,
      caseId: actual.id + ':case',
      attempt: { id: actual.id + ':attempt', retry: 0, repeat: 0 },
      name: 'body',
      status: mode === 'run' ? 'passed' : 'skipped',
      mode,
      durationMs: 17,
      errors: [],
    })
    if (!noRoot)
      machine.onEvent({
        ...envelope,
        type: 'suite-end',
        entryId: actual.id,
        suiteId: nestedOnly ? actual.id + ':nested' : actual.id,
        name: 'actual suite',
        ancestors: [],
        mode,
        status: rootStatus,
        durationMs: roots[index],
        errors: [],
      })
    if (!noPhysical)
      machine.onEvent({
        ...envelope,
        type: 'file-end',
        entryId: actual.id,
        status: physicalStatus,
        durationMs: 222,
      })
  }
  if (!noPhysical)
    machine.onEvent({
      ...envelope,
      type: 'run-end',
      status: physicalStatus,
      durationMs: 222,
    })
  return { machine, entries }
}
function times(machine) {
  const before = JSON.stringify(machine.getJson())
  const xml = machine.getJUnit()
  assert.equal(JSON.stringify(machine.getJson()), before)
  return {
    file: [...xml.matchAll(/<testsuite\s+[^>]*?\btime="([^"]+)"/g)].map(
      (match) => match[1]
    ),
    cases: [...xml.matchAll(/<testcase\s+[^>]*?\btime="([^"]+)"/g)].map(
      (match) => match[1]
    ),
  }
}
function check(options, expected) {
  const { machine } = build(options)
  const rendered = times(machine)
  assert.deepEqual(rendered.file, expected)
  assert(
    rendered.cases.every(
      (time) =>
        time === (options?.mode && options.mode !== 'run' ? '0' : '0.017')
    )
  )
  return machine
}
let controls = 0
try {
  check({}, ['0.0123456789'])
  controls++
  check({ roots: [0] }, ['0'])
  controls++
  check({ roots: [1234567.89123456] }, ['1234.5678912346'])
  controls++
  check({ noRoot: true }, ['0.222'])
  controls++
  check({ nestedOnly: true }, ['0.222'])
  controls++
  check({ mode: 'skip', rootStatus: 'skipped' }, ['0.222'])
  controls++
  check({ mode: 'todo', rootStatus: 'skipped' }, ['0.222'])
  controls++
  check({ rootStatus: 'cancelled', physicalStatus: 'cancelled' }, ['0.222'])
  controls++
  check({ physicalStatus: 'cancelled' }, ['0.222'])
  controls++
  check({ noPhysical: true }, ['0'])
  controls++
  check({ roots: [10, 20] }, ['0.222', '0.222'])
  controls++
  check({ rootStatus: 'failed', physicalStatus: 'failed' }, ['0.0123456789'])
  controls++
  const cleanupFailed = check({ physicalStatus: 'failed' }, ['0.0123456789'])
  assert.equal(cleanupFailed.getJson().testResults[0].status, 'failed')
  controls++
  for (const value of [21.123456789123, Infinity]) {
    const original = build({ roots: [value === Infinity ? 21 : value] })
    const records = original.machine.snapshotClosedFiles(
      new Set(original.entries.map((entry) => entry.id))
    )
    if (value === Infinity) records[0].result.suites[0].durationMs = value
    const retained = createMachineReporter({
      projectDir,
      reporters: ['junit'],
      write() {},
    })
    machines.push(retained)
    retained.onEvent({
      ...envelope,
      runId: 'retained',
      type: 'run-start',
      timestamp: 200,
    })
    retained.retainUnexecutedFiles(
      original.entries,
      records,
      original.entries.map((entry) => entry.id)
    )
    retained.onEvent({
      ...envelope,
      runId: 'retained',
      type: 'run-end',
      timestamp: 200,
      status: 'passed',
      durationMs: 0,
    })
    const physical = JSON.stringify(records)
    assert.deepEqual(times(retained).file, [
      value === Infinity ? '0.222' : '0.0211234568',
    ])
    assert.equal(JSON.stringify(records), physical)
    controls++
  }
  const prior = build({ roots: [21], names: ['retained.case.mjs'] })
  const priorRecords = prior.machine.snapshotClosedFiles(
    new Set(prior.entries.map((entry) => entry.id))
  )
  const present = build({
    roots: [11],
    names: ['current.case.mjs'],
    idOffset: 1,
    outputText: ['owned current stdout'],
  })
  present.machine.retainUnexecutedFiles(
    [...prior.entries, ...present.entries],
    priorRecords,
    [...prior.entries, ...present.entries].map((entry) => entry.id)
  )
  const beforeCurrent = JSON.stringify(present.machine.getJson())
  const suites = [
    ...present.machine
      .getJUnit()
      .matchAll(
        /<testsuite\s+name="([^"]+)"[^>]*\btime="([^"]+)"[^>]*>(.*?)<\/testsuite>/gs
      ),
  ].map((match) => ({ name: match[1], time: match[2], body: match[3] }))
  assert.deepEqual(
    suites.map(({ name, time }) => ({ name, time })),
    [
      { name: 'retained.case.mjs', time: '0.021' },
      { name: 'current.case.mjs', time: '0.011' },
    ]
  )
  assert(!suites[0].body.includes('owned current stdout'))
  assert(
    suites[1].body.includes('<system-out>owned current stdout</system-out>')
  )
  assert.equal(JSON.stringify(present.machine.getJson()), beforeCurrent)
  controls++
  const unknown = { ...entry(5), file: join(projectDir, 'unexecuted.case.mjs') }
  present.machine.retainUnexecutedFiles(
    [unknown, ...present.entries],
    [],
    [unknown.id, ...present.entries.map((entry) => entry.id)]
  )
  const missing = present.machine.getJUnit()
  assert(missing.includes('name="unexecuted.case.mjs"'))
  assert.equal((missing.match(/owned current stdout/g) ?? []).length, 1)
  controls++
  const ambiguous = build({
    roots: [11, 12],
    outputText: ['owned first stdout', 'owned second stdout'],
  })
  const ambiguousBefore = JSON.stringify(ambiguous.machine.getJson())
  const ambiguousXML = ambiguous.machine.getJUnit()
  assert(!ambiguousXML.includes('owned first stdout'))
  assert(!ambiguousXML.includes('owned second stdout'))
  assert.equal(JSON.stringify(ambiguous.machine.getJson()), ambiguousBefore)
  assert(
    ambiguousBefore.includes('owned first stdout') &&
      ambiguousBefore.includes('owned second stdout')
  )
  assert.deepEqual(times(ambiguous.machine).file, ['0.222', '0.222'])
  controls++
  assert.equal(controls, 18)
  writeFileSync(
    output,
    JSON.stringify(
      {
        durationControls: controls,
        actualLogicalRootDuration: true,
        fractionalFormattingExact: true,
        currentAndRetainedOwned: true,
        ambiguousMissingCancelledFallbackHeld: true,
        physicalResultsEventsJSONAndCaseTimesHeld: true,
        actualRetainedCurrentOutputOwned: true,
        absentAndAmbiguousOutputNotGuessed: true,
        sdkAbsent: !!installedConsumer,
        version: process.version,
        execPath: process.execPath,
        versions: process.versions,
      },
      null,
      2
    ) + '\n'
  )
} finally {
  for (const machine of machines) await machine.dispose()
  rmSync(projectDir, { recursive: true, force: true })
}
