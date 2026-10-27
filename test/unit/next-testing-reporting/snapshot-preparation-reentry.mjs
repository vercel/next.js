import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const require = createRequire(import.meta.url)
require('next/dist/server/node-environment-baseline')
const runner = require('next/dist/experimental/testing/runner')
const {
  createAssertionRuntime,
} = require('next/dist/experimental/testing/assertions')
const {
  VitestSnapshotEnvironment,
} = require('next/dist/experimental/testing/assertions/snapshot-environment')
const [mode, output] = process.argv.slice(2)
const directory = mkdtempSync(join(tmpdir(), 'next-snapshot-reentry-'))
const filePath = join(directory, 'owned.case.mjs')
const snapshotPath = join(directory, '__snapshots__', 'owned.case.mjs.snap')
const bytes = '// Vitest Snapshot v1, https://vitest.dev/guide/snapshot.html\n'
mkdirSync(join(directory, '__snapshots__'))
writeFileSync(filePath, '// owned file\n')
writeFileSync(snapshotPath, bytes)
const prototype = VitestSnapshotEnvironment.prototype
const pathDescriptor = Object.getOwnPropertyDescriptor(prototype, 'resolvePath')
const resolvePath = prototype.resolvePath
const readDescriptor = Object.getOwnPropertyDescriptor(fs.promises, 'readFile')
const readFile = fs.promises.readFile
const NativePromise = Promise
const speciesDescriptor = Object.getOwnPropertyDescriptor(
  NativePromise,
  Symbol.species
)
const constructorMode = mode.endsWith('constructor')
const turnMode = mode.endsWith('turn')
const undefinedMode = mode.endsWith('undefined')
let startRead, releaseRead
const readStarted = new NativePromise((resolve) => {
  startRead = resolve
})
const readReleased = new NativePromise((resolve) => {
  releaseRead = resolve
})
let settlementTicks = 0
let runtime,
  file,
  second,
  secondOutcome,
  entered = false,
  resolutions = 0,
  reads = 0,
  constructorCalls = 0,
  speciesReads = 0
const events = []
async function outcome(promise) {
  try {
    return { fulfilled: true, value: await promise }
  } catch (error) {
    return { fulfilled: false, error }
  }
}
Object.defineProperty(prototype, 'resolvePath', {
  configurable: true,
  writable: true,
  value: function (path) {
    resolutions++
    events.push('resolve')
    if (!entered && !constructorMode && !turnMode) {
      entered = true
      second = mode.startsWith('runtime')
        ? runtime.prepareSnapshots()
        : file.prepareSnapshotsAfterFailedCollection()
      secondOutcome = outcome(second)
    }
    return Reflect.apply(resolvePath, this, [path])
  },
})
Object.defineProperty(fs.promises, 'readFile', {
  ...readDescriptor,
  value: async function (path, ...args) {
    if (path === snapshotPath) {
      reads++
      if (undefinedMode) {
        // eslint-disable-next-line no-throw-literal -- Actual undefined setup rejection.
        throw undefined
      }
    }
    const result = await Reflect.apply(readFile, this, [path, ...args])
    if (path === snapshotPath && turnMode) {
      startRead()
      await readReleased
    }
    return result
  },
})
try {
  if (mode.startsWith('runtime'))
    runtime = await createAssertionRuntime({
      testPath: filePath,
      getCurrentAttempt: () => undefined,
      deferSnapshotPreparation: true,
    })
  else {
    file = runner.initializeTestFile({
      fileId: mode,
      filePath,
      preparePublicSnapshots: true,
      onCollectionFailure() {},
    })
    const collected = await outcome(
      file.collect(() => {
        throw new Error('owned load failure')
      })
    )
    assert.equal(collected.fulfilled, false)
  }
  if (constructorMode) {
    globalThis.Promise = class ObservedPromise extends NativePromise {
      constructor(...args) {
        constructorCalls++
        super(...args)
      }
    }
    Object.defineProperty(NativePromise, Symbol.species, {
      configurable: true,
      get() {
        speciesReads++
        return NativePromise
      },
    })
  }
  events.push('call')
  const first = mode.startsWith('runtime')
    ? runtime.prepareSnapshots()
    : file.prepareSnapshotsAfterFailedCollection()
  events.push('returned')
  const settled = outcome(first)
  if (turnMode) {
    await readStarted
    let done = false
    void settled.then(() => {
      done = true
    })
    queueMicrotask(function tick() {
      settlementTicks++
      if (!done) queueMicrotask(tick)
    })
    releaseRead()
  }
  const firstOutcome = await settled
  if (secondOutcome) await secondOutcome
  globalThis.Promise = NativePromise
  Object.defineProperty(NativePromise, Symbol.species, speciesDescriptor)
  assert.equal(first.constructor, NativePromise)
  assert.equal(resolutions, 1)
  assert.equal(reads, 1)
  if (!constructorMode && !turnMode) assert.equal(first, second)
  assert.equal(firstOutcome.fulfilled, !undefinedMode)
  if (undefinedMode) assert.equal(firstOutcome.error, undefined)
  if (constructorMode) {
    assert.equal(constructorCalls, 0)
    assert.equal(speciesReads, 1)
  }
  assert.deepEqual(events, ['call', 'resolve', 'returned'])
  await runtime?.finishFile()
  await file?.dispose()
  assert.equal(fs.readFileSync(snapshotPath, 'utf8'), bytes)
  writeFileSync(
    output,
    JSON.stringify({
      mode,
      resolutions,
      reads,
      constructorCalls,
      speciesReads,
      sameOwnedPromise: constructorMode || turnMode || first === second,
      settlementTicks,
      exactBytes: true,
    }) + '\n'
  )
} finally {
  globalThis.Promise = NativePromise
  Object.defineProperty(NativePromise, Symbol.species, speciesDescriptor)
  if (pathDescriptor)
    Object.defineProperty(prototype, 'resolvePath', pathDescriptor)
  else delete prototype.resolvePath
  Object.defineProperty(fs.promises, 'readFile', readDescriptor)
  if (secondOutcome) await secondOutcome
  try {
    await runtime?.finishFile()
  } catch {}
  try {
    await file?.dispose()
  } catch {}
  rmSync(directory, { recursive: true, force: true })
}
