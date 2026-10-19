import assert from 'node:assert/strict'
import { it } from 'node:test'
import {
  mkdtemp,
  mkdir,
  writeFile,
  copyFile,
  readFile,
  rm,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { initializeTestFile } from 'next/dist/experimental/testing/runner'
import { chai, expect, test } from 'next/dist/experimental/testing/vitest'

function report(value: unknown) {
  console.log(
    JSON.stringify(value, (_key, entry) =>
      entry instanceof Error
        ? {
            name: entry.name,
            message: entry.message,
            stack: entry.stack,
            ...entry,
          }
        : entry
    )
  )
}
const observeEventSemantics: (
  value: unknown
) => unknown = require('./chai-event-semantics.cjs')
const observeMethodShapes: (events: EventTarget) => {
  methods: Record<
    string,
    { name: string; length: number; own: unknown; prototype: unknown }
  >
  missing: unknown
} = require('./chai-event-semantics.cjs').methodShapes

async function withFile(
  body: (file: ReturnType<typeof initializeTestFile>) => Promise<void>
) {
  const directory = await mkdtemp(join(tmpdir(), 'next-chai-events08-'))
  const file = initializeTestFile({
    fileId: 'entry',
    filePath: join(directory, 'events.test.ts'),
  })
  try {
    await body(file)
  } finally {
    try {
      await file.dispose()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }
}

it('matches every original pristine registration-event dictionary and target identity', async () => {
  const directory = await mkdtemp(
    join(tmpdir(), 'next-chai-events08-contract-')
  )
  const previous = process.env.NEXT_TESTING_CHAI141_EVIDENCE
  const evidence = join(directory, 'observations.jsonl')
  process.env.NEXT_TESTING_CHAI141_EVIDENCE = evidence
  try {
    await mkdir(join(directory, 'node_modules/vitest'), { recursive: true })
    await writeFile(
      join(directory, 'node_modules/vitest/package.json'),
      JSON.stringify({ name: 'vitest', main: 'index.cjs' })
    )
    await writeFile(
      join(directory, 'node_modules/vitest/index.cjs'),
      `module.exports = require(${JSON.stringify(require.resolve('next/dist/experimental/testing/vitest'))})\n`
    )
    await copyFile(
      join(__dirname, 'chai-utility-contract.mjs.txt'),
      join(directory, 'contract.mjs')
    )
    await withFile(async (file) => {
      await file.collect(() => import(join(directory, 'contract.mjs')))
      const result = await file.run({
        runId: 'events-original',
        signal: new AbortController().signal,
      })
      const rows = (await readFile(evidence, 'utf8'))
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line))
      const pristine = JSON.parse(
        await readFile(join(__dirname, 'chai-utility-pristine.json'), 'utf8')
      )
      report({
        actualEventContractResult: result,
        actualRows: rows,
        completePristineRows: pristine,
      })
      assert.deepEqual(
        result.cases.map((entry) => entry.status),
        ['passed', 'passed', 'passed']
      )
      assert.deepEqual(result.errors, [])
      const eventRows = rows.filter(
        (row) => row.label === 'plugin-event' || row.label === 'events'
      )
      assert.equal(eventRows.length, 4)
      assert.deepEqual(
        eventRows,
        pristine.filter(
          (row: { label: string }) =>
            row.label === 'plugin-event' || row.label === 'events'
        )
      )
    })
  } finally {
    if (previous === undefined) delete process.env.NEXT_TESTING_CHAI141_EVIDENCE
    else process.env.NEXT_TESTING_CHAI141_EVIDENCE = previous
    await rm(directory, { recursive: true, force: true })
  }
})

it('matches native once, duplicate, object, signal, cancellation and reentrant registration behavior', async () => {
  await withFile(async (file) => {
    await file.collect(async () => {
      test('native event listener behavior', async () => {
        const actual = observeEventSemantics(chai)
        const expected = JSON.parse(
          await readFile(
            join(__dirname, 'chai-event-semantics-pristine.json'),
            'utf8'
          )
        )
        report({
          actualEventSemantics: actual,
          pristineEventSemantics: expected,
        })
        assert.deepEqual(actual, expected)
        const shapes = observeMethodShapes(
          Reflect.get(chai.util, 'events') as EventTarget
        )
        const pristineShapes = JSON.parse(
          await readFile(
            join(__dirname, 'chai-event-methods-pristine.json'),
            'utf8'
          )
        )
        report({
          actualEventMethodShapes: shapes,
          pristineEventMethodShapes: pristineShapes,
        })
        assert.deepEqual(shapes.missing, pristineShapes.missing)
        for (const key of Object.keys(pristineShapes.methods)) {
          assert.equal(
            shapes.methods[key].name,
            pristineShapes.methods[key].name
          )
          assert.equal(
            shapes.methods[key].length,
            pristineShapes.methods[key].length
          )
          assert.deepEqual(
            shapes.methods[key].prototype,
            pristineShapes.methods[key].prototype
          )
          // The file-owned wrappers are own methods; the native target inherits them.
          assert.equal(pristineShapes.methods[key].own, null)
          assert.deepEqual(shapes.methods[key].own, {
            valueType: 'function',
            writable: true,
            enumerable: false,
            configurable: true,
          })
        }
        assert.equal(expect.getState().assertionCalls, 0)
      })
    })
    const result = await file.run({
      runId: 'events-semantics',
      signal: new AbortController().signal,
    })
    report({ actualEventSemanticsResult: result })
    assert.deepEqual(
      result.cases.map((entry) => entry.status),
      ['passed']
    )
    assert.deepEqual(result.errors, [])
  })
})

it('removes file A listeners before file B and preserves original retained-target disposal', async () => {
  let old: EventTarget | undefined
  let callsA = 0
  let callsB = 0
  await withFile(async (file) => {
    await file.collect(async () => {
      old = Reflect.get(chai.util, 'events') as EventTarget
      old.addEventListener('custom', () => callsA++)
      old.addEventListener('addMethod', () => callsA++, { capture: true })
      test('file A target', () => {
        old!.dispatchEvent(new Event('custom'))
        assert.equal(callsA, 1)
        assert.equal(expect.getState().assertionCalls, 0)
      })
    })
    const result = await file.run({
      runId: 'events-a',
      signal: new AbortController().signal,
    })
    report({ actualEventsA: result, callsA })
    assert.deepEqual(
      result.cases.map((entry) => entry.status),
      ['passed']
    )
    assert.deepEqual(result.errors, [])
  })
  await withFile(async (file) => {
    await file.collect(async () => {
      test('file B owns a new native target and no A listener', () => {
        const current = Reflect.get(chai.util, 'events') as EventTarget
        assert.notEqual(current, old)
        const before = callsA
        assert.throws(
          () => old!.dispatchEvent(new Event('custom')),
          /active Next|disposed|different Next/
        )
        // The native listener registrations themselves have been removed.
        EventTarget.prototype.dispatchEvent.call(old, new Event('custom'))
        EventTarget.prototype.dispatchEvent.call(old, new Event('addMethod'))
        assert.equal(callsA, before)
        current.addEventListener('addMethod', () => callsB++)
        chai.Assertion.addMethod('events08FreshB', function () {
          return this
        })
        assert.equal(callsA, before)
        assert.equal(callsB, 1)
        assert.equal(expect.getState().assertionCalls, 0)
      })
    })
    const result = await file.run({
      runId: 'events-b',
      signal: new AbortController().signal,
    })
    report({ actualEventsB: result, callsA, callsB })
    assert.deepEqual(
      result.cases.map((entry) => entry.status),
      ['passed']
    )
    assert.deepEqual(result.errors, [])
  })
})
