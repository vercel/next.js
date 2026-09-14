import {
  someLongExportName,
  anotherLongExportName,
  aLongFunctionName,
} from './shared'

it('should be correct with scope hoisting enabled', () => {
  expect(someLongExportName).toBe('shared-1')
  expect(anotherLongExportName).toBe('shared-2')
  expect(aLongFunctionName()).toBe('shared-fn')
})

it('should be correct across a chunk boundary with scope hoisting enabled', async () => {
  // `lazy.js` lives in another chunk and reads the same module, so the binding has to be resolved
  // through the emitted export object rather than a merged local.
  const { fromLazy } = await import(
    /* turbopackExports: ["fromLazy"] */ './lazy'
  )
  expect(fromLazy()).toBe('shared-1/shared-fn')
})
