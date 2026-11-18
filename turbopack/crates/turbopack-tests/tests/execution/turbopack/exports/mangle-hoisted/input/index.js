import { Worker } from 'node:worker_threads'
import * as preserved from './mixed-preserved'
import {
  someLongExportName as mixedFirst,
  a as mixedFirstShort,
  liveValue as mixedLiveValue,
} from './mixed-first'
import {
  someLongExportName as mixedSecond,
  a as mixedSecondShort,
} from './mixed-second'
import {
  someLongExportName,
  anotherLongExportName,
  aLongFunctionName,
  a as sharedShort,
} from './shared'
import {
  someLongExportName as secondName,
  a as secondShort,
  liveValue,
  increment,
} from './second'

it('should keep one observable namespace without deoptimizing its flat peers', async () => {
  const lazy = await import(
    /* turbopackExports: ["namespace", "read", "update"] */ './mixed-lazy'
  )
  expect(lazy.namespace()).toBe(preserved)
  expect(Object.keys(preserved).sort()).toEqual([
    'increment',
    'liveValue',
    'someLongExportName',
  ])
  expect([mixedFirst, mixedSecond, mixedFirstShort, mixedSecondShort]).toEqual([
    'first',
    'second',
    'first-short',
    'second-short',
  ])
  expect(lazy.read()).toEqual([
    'preserved',
    'first',
    'second',
    'first-short',
    'second-short',
    0,
    0,
  ])
  lazy.update()
  expect(preserved.liveValue).toBe(1)
  expect(mixedLiveValue).toBe(1)
  expect(lazy.read()).toEqual([
    'preserved',
    'first',
    'second',
    'first-short',
    'second-short',
    1,
    1,
  ])
  const again = await import(
    /* turbopackExports: ["namespace", "read", "update"] */ './mixed-lazy'
  )
  expect(again.namespace()).toBe(preserved)
  expect(preserved).not.toHaveProperty('a')
})

it('should be correct with scope hoisting enabled', () => {
  expect(someLongExportName).toBe('shared-1')
  expect(anotherLongExportName).toBe('shared-2')
  expect(aLongFunctionName()).toBe('shared-fn')
  expect(secondName).toBe('second-1')
  expect(sharedShort).toBe('shared-short')
  expect(secondShort).toBe('second-short')
})

it('should resolve worker helper exports with mangling and hoisting enabled', async () => {
  const worker = new Worker(new URL('./worker.js', import.meta.url))
  try {
    const message = await new Promise((resolve, reject) => {
      worker.on('message', resolve)
      worker.on('error', reject)
    })
    expect(message).toBe('flat-exports-worker')
  } finally {
    await worker.terminate()
  }
})

it('should be correct across a chunk boundary with scope hoisting enabled', async () => {
  // `lazy.js` lives in another chunk and reads the same module, so the binding has to be resolved
  // through the emitted export object rather than a merged local.
  const { fromLazy } = await import(
    /* turbopackExports: ["fromLazy"] */ './lazy'
  )
  expect(fromLazy()).toBe(
    'shared-1/shared-fn/second-1/shared-short/second-short/0'
  )
  increment()
  expect(liveValue).toBe(1)
  expect(fromLazy()).toBe(
    'shared-1/shared-fn/second-1/shared-short/second-short/1'
  )

  // Another chunk reads and updates the noncanonical member of the same shared group. All of its
  // imports must use the one registered factory ID, and updates must remain visible in both chunks.
  const { readAndIncrement } = await import(
    /* turbopackExports: ["readAndIncrement"] */ './lazy-second'
  )
  expect(readAndIncrement()).toEqual(['shared-1', 1, 2])
  expect(liveValue).toBe(2)
  expect(fromLazy()).toBe(
    'shared-1/shared-fn/second-1/shared-short/second-short/2'
  )
})
