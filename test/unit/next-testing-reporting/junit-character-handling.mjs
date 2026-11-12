import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const [output, installedConsumer] = process.argv.slice(2),
  local = dirname(fileURLToPath(import.meta.url)),
  consumer = installedConsumer ?? resolve(local, '../../..'),
  require = createRequire(join(consumer, 'package.json')),
  sourceRequire = createRequire(import.meta.url),
  parserRequire = createRequire(sourceRequire.resolve('jest-environment-jsdom'))
const { SaxesParser } = parserRequire('saxes')
require('next/dist/server/node-environment-baseline')
const {
  createMachineReporter,
} = require('next/dist/experimental/testing/reporting/machine')
const data = JSON.parse(
    readFileSync(join(local, 'fixtures/junit-character-handling.json'), 'utf8')
  ),
  directory = mkdtempSync(join(tmpdir(), 'next-junit-characters-')),
  file = join(directory, 'characters.case.mjs'),
  target = join(directory, 'result.xml')
writeFileSync(file, '// protocol XML formatting controls\n')
if (installedConsumer)
  for (const name of ['vitest', 'vite', '@vitest/mocker'])
    assert.throws(() => require.resolve(name), { code: 'MODULE_NOT_FOUND' })
const machine = createMachineReporter({
    projectDir: directory,
    reporters: ['junit'],
    outputFile: target,
    write() {},
  }),
  envelope = { version: 1, runId: 'owned-characters', timestamp: 1 },
  entry = {
    id: 'owned-file',
    file,
    profile: {
      id: '',
      mode: 'development',
      environment: 'node',
      runtime: 'nodejs',
      bundler: 'turbopack',
    },
  }
try {
  await machine.initialize()
  machine.onEvent({ ...envelope, type: 'run-start' })
  machine.onEvent({ ...envelope, type: 'file-start', entry })
  for (const [index, row] of data.rows.entries()) {
    const caseId = 'character-' + index,
      attempt = { id: 'attempt-' + index, retry: 0, repeat: 0 }
    machine.onEvent({
      ...envelope,
      type: 'case-end',
      entryId: entry.id,
      caseId,
      name: row.title,
      testName: row.title,
      ancestors: [],
      mode: 'run',
      attempt,
      status: 'passed',
      durationMs: 1,
      errors: [],
    })
    for (const stream of ['stdout', 'stderr'])
      machine.onEvent({
        ...envelope,
        type: 'output',
        entryId: entry.id,
        caseId,
        attempt,
        stream,
        text: Buffer.from(row.content).toString('utf8') + '\n',
      })
  }
  machine.onEvent({
    ...envelope,
    type: 'file-end',
    entryId: entry.id,
    status: 'passed',
    durationMs: 1,
  })
  machine.onEvent({
    ...envelope,
    type: 'run-end',
    status: 'passed',
    durationMs: 1,
  })
  const original = machine.getJson().next.events
  await machine.finish()
  assert.deepEqual(machine.getJson().next.events, original)
  assert.deepEqual(
    original
      .filter((event) => event.type === 'case-end')
      .map((event) => event.name),
    data.rows.map((row) => row.title)
  )
  const xml = readFileSync(target, 'utf8'),
    parser = new SaxesParser()
  parser.write(xml).close()
  const names = [...xml.matchAll(/<testcase\s+[^>]*?\bname="([^"]*)"/g)].map(
    (match) => match[1]
  )
  assert.equal(names.length, 19)
  let compared = 0
  for (const [index, row] of data.rows.entries()) {
    if (row.compareGenuine) {
      assert.equal(names[index], row.encodedName, row.id)
      assert(xml.includes(row.encodedConsoleOut), row.id + ' stdout')
      assert(xml.includes(row.encodedConsoleErr), row.id + ' stderr')
      compared++
    }
    if (row.id === 'entity-low') {
      assert.equal(names[index], row.sourceBeforeEncodedName)
      assert(names[index].includes('&amp;'))
      assert.notEqual(names[index], row.encodedName)
    }
  }
  assert.equal(compared, 11)
  writeFileSync(
    output,
    JSON.stringify(
      {
        genuineValidRowsExact: compared,
        all19SourceRowsValidXML: true,
        knownReferenceDefectNotCopied: true,
        physicalNamesAndEventsUnchanged: true,
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
  await machine.dispose()
  rmSync(directory, { recursive: true, force: true })
}
