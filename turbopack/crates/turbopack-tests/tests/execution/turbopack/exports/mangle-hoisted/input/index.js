import { Worker } from 'node:worker_threads'
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
})
