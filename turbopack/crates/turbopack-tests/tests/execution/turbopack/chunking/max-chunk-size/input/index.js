import { a1 } from './a/a1.js'
import { a2 } from './a/a2.js'
import { a3 } from './a/a3.js'
import { b1 } from './b/b1.js'
import { b2 } from './b/b2.js'
import { tla } from './b/tla.js'

// All modules together are bigger than `maxChunkSize`, so they are split into multiple chunks.
it('should evaluate modules from split chunks', () => {
  expect(a1).toMatch(/^a1: Lorem ipsum/)
  expect(a2).toMatch(/^a2: Lorem ipsum/)
  expect(a3).toMatch(/^a3: Lorem ipsum/)
  expect(b1).toMatch(/^b1: Lorem ipsum/)
  expect(b2).toMatch(/^b2: Lorem ipsum/)
  expect(tla).toMatch(/^tla: Lorem ipsum/)
})

it('should load a dynamically imported split chunk group', async () => {
  const { lazy } = await import('./lazy/lazy.js')
  expect(lazy()).toEqual(['a1', 'b1', 'lazy1', 'lazy2', 'lazy3'])
})
