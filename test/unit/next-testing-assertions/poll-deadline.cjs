const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createHash } = require('node:crypto')
const { createRequire } = require('node:module')
const [project, output, mode] = process.argv.slice(2)
const resourcesOnly = mode === 'resources-only'
assert(project)
const req = createRequire(path.join(project, 'package.json'))
const next = path.dirname(req.resolve('next/package.json'))
const inputs = path.join(__dirname, 'fixtures/poll-deadline')
const header = "import { expect, test, chai, vi } from 'vitest'\n"
req(next + '/dist/server/node-environment-baseline')
const setDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'setTimeout')
const clearDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  'clearTimeout'
)
const nativeSet = globalThis.setTimeout
const nativeClear = globalThis.clearTimeout
const nextTurn = () => new Promise(setImmediate)
const active = new Map()
const targetTimeout = 10000000
let targetAllocated = 0
function trackedSet(callback, delay, ...args) {
  const handle = nativeSet(
    function (...values) {
      active.delete(handle)
      return callback(...values)
    },
    delay,
    ...args
  )
  active.set(handle, delay)
  if (delay === targetTimeout) targetAllocated++
  return handle
}
function trackedClear(handle) {
  active.delete(handle)
  return nativeClear(handle)
}
assert(!req.cache[next + '/dist/experimental/testing/assertions/index.js'])
Object.defineProperty(globalThis, 'setTimeout', {
  ...setDescriptor,
  value: trackedSet,
})
Object.defineProperty(globalThis, 'clearTimeout', {
  ...clearDescriptor,
  value: trackedClear,
})
let runner, vitest, primitives
try {
  runner = req(next + '/dist/experimental/testing/runner')
  vitest = req(next + '/dist/experimental/testing/vitest')
  primitives = req(next + '/dist/experimental/testing/primitives')
} finally {
  Object.defineProperty(globalThis, 'setTimeout', setDescriptor)
  Object.defineProperty(globalThis, 'clearTimeout', clearDescriptor)
}
const dir = fs.mkdtempSync(
  path.join(os.tmpdir(), 'next-poll-deadline-component-')
)
const rows = [],
  rawErrors = [],
  cases = [],
  resources = []
let fileNumber = 0
const createFile = () =>
  runner.initializeTestFile({
    fileId: 'poll-deadline-' + ++fileNumber,
    filePath: path.join(dir, fileNumber + '.test.mjs'),
  })
async function runFile(file) {
  const observed = []
  const result = await file.run({
    runId: 'poll-deadline-run-' + fileNumber,
    signal: new AbortController().signal,
    onCaseResult(_task, value) {
      observed.push({
        name: value.name,
        state: value.status,
        errors: value.errors,
      })
    },
  })
  if (output)
    fs.writeFileSync(
      output + '.run-' + fileNumber + '.json',
      JSON.stringify(
        {
          interrupted: result.interrupted,
          observed: observed.map(({ name, state, errors }) => ({
            name,
            state,
            errors: errors.map((item) => ({
              phase: item.phase,
              name: item.error?.name,
              message: item.error?.message,
              stack: item.error?.stack,
            })),
          })),
          rows,
          rawErrors,
          nativeTimerDelays: [...active.values()],
        },
        null,
        2
      ) + '\n'
    )
  assert.equal(result.interrupted, false)
  return observed
}
const targetHandles = () =>
  [...active.values()].filter((delay) => delay === targetTimeout).length
async function main() {
  const families = []
  if (!resourcesOnly)
    for (const family of ['core', 'takeover']) {
      const source = path.join(inputs, family)
      const model = JSON.parse(
        fs.readFileSync(path.join(source, 'reference.json'))
      )
      const authored = fs.readFileSync(path.join(source, model.source), 'utf8')
      assert.equal(
        createHash('sha256').update(authored).digest('hex'),
        model.bodySHA256
      )
      assert(authored.startsWith(header))
      const file = createFile(),
        familyRows = [],
        familyErrors = []
      try {
        await file.collect(async () => {
          const capture = {
            log(content) {
              if (content.startsWith('POLL_OWNERSHIP_ROW '))
                familyRows.push(JSON.parse(content.slice(19)))
              else if (content.startsWith('POLL_OWNERSHIP_ERROR '))
                familyErrors.push(JSON.parse(content.slice(21)))
              else throw new Error('Unexpected authored console content')
            },
          }
          new Function(
            'vitest',
            'console',
            '"use strict";const{expect,test,chai,vi}=vitest;\n' +
              authored.slice(header.length)
          )(vitest, capture)
        })
        const observed = await runFile(file)
        await file.dispose()
        assert.deepEqual(familyRows, model.rows)
        assert.deepEqual(
          observed.map(({ name, state }) => ({ name, state })),
          model.cases
        )
        assert(observed.every((value) => value.errors.length === 0))
        assert.equal(familyErrors.length, model.rawErrorCount)
        assert.equal(active.size, 0)
        rows.push(...familyRows)
        rawErrors.push(...familyErrors)
        cases.push(...observed)
        families.push({
          family,
          cases: observed.length,
          rows: familyRows.length,
          rawErrors: familyErrors.length,
        })
      } finally {
        await file.dispose()
      }
    }
  for (const kind of ['pending-predicate', 'pending-start', 'success']) {
    const resource = createFile()
    let release,
      signal,
      callbacks = 0
    const held = new Promise((resolve) => {
      release = resolve
    })
    const outcomes = []
    const before = targetAllocated
    try {
      await resource.collect(async () => {
        resource.api.test('actual timer owner ' + kind, async ({ expect }) => {
          const initial = expect.poll(
            (options) => {
              callbacks++
              signal = options.signal
              return kind === 'pending-predicate' ? held : 1
            },
            { timeout: targetTimeout, interval: 1 }
          )
          if (kind === 'pending-start')
            primitives.chai.util.flag(initial, '_poll.onStart', () => held)
          const matched = initial.toBe(1)
          if (kind === 'success') await matched
          else
            matched.then(
              () => outcomes.push('fulfilled'),
              (reason) =>
                outcomes.push({ rejected: reason?.message ?? String(reason) })
            )
        })
      })
      const observed = await runFile(resource)
      await resource.dispose()
      assert.equal(observed.length, 1)
      assert.equal(observed[0].state, 'passed')
      assert.equal(observed[0].errors.length, 0)
      assert.equal(targetHandles(), 0)
      assert.equal(targetAllocated - before, kind === 'pending-start' ? 0 : 1)
      if (kind !== 'pending-start') assert.equal(signal.aborted, false)
      release(1)
      await held
      await nextTurn()
      assert.equal(targetHandles(), 0)
      assert.equal(targetAllocated - before, kind === 'pending-start' ? 0 : 1)
      assert.equal(callbacks, kind === 'pending-start' ? 0 : 1)
      resources.push({
        kind,
        targetAllocated: targetAllocated - before,
        activeNativeTimers: targetHandles(),
        publicSignalAborted: signal?.aborted ?? null,
        callbacks,
        outcomes,
        actualFileDisposed: true,
      })
    } finally {
      await resource.dispose()
    }
  }
  assert.equal(active.size, 0)
  if (output)
    fs.writeFileSync(
      output,
      JSON.stringify(
        {
          cases,
          rows,
          rawErrors,
          resources,
          allNativeTimersCleared: true,
          pendingConsumerLifetimeParity:
            'open; clear-only owner resource checks do not fabricate promise outcomes',
        },
        null,
        2
      ) + '\n'
    )
  process.stdout.write(
    JSON.stringify({
      families,
      rawErrors: rawErrors.length,
      actualScopeResourceControls: 3,
      allNativeTimersCleared: true,
      noForcedSettlementOrPublicAbort: true,
      lateOwnerCannotReacquireTimers: true,
      noFabricatedCaseResults: true,
    }) + '\n'
  )
}
main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => {
    for (const handle of active.keys()) nativeClear(handle)
    fs.rmSync(dir, { recursive: true, force: true })
  })
