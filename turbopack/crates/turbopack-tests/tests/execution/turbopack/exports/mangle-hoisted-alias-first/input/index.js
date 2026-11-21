import { someLongExportName, a, liveValue } from './flat'
import * as preserved from './preserved'

it('keeps the preserved namespace in the merged group distinct', async () => {
  const lazy = await import('./lazy')
  expect(lazy.read()).toEqual([someLongExportName, a, 0, preserved])
  expect(Object.keys(preserved).sort()).toEqual([
    'increment',
    'liveValue',
    'someLongExportName',
  ])
  lazy.update()
  expect(liveValue).toBe(1)
  expect(preserved.liveValue).toBe(1)
  expect(lazy.read()).toEqual([someLongExportName, a, 1, preserved])
})

it('registers flat exports when a preserved alias starts the factory', () => {
  // Loaded at runtime from outside the bundle; `eval` or bundled requires here would stop
  // this module's import sequence from being merged.
  process.mainModule.require(process.cwd() + '/replay-alias-first.js')()
})
